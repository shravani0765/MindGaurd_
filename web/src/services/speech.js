// web/src/services/speech.js
import { aiConfig } from './aiConfig';
import { getPersona, kokoroEngine } from './kokoroEngine';
import { conditionForSpeech, resolveCadence } from './prosody';

class SpeechService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onStateChangeCallback = null;
    this.onSpeechFinalizedCallback = null;

    // Buffers for speech accumulation & silence debounce
    this.accumulatedTranscript = '';
    this.interimTranscript = '';
    this.silenceTimer = null;

    // Incremented on every speak()/stopSpeaking() so a slow neural chunk
    // that resolves after the user moved on cannot start playing late.
    this.utteranceToken = 0;

    this.initRecognition();
  }

  initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStateChangeCallback) this.onStateChangeCallback(true);
    };

    this.recognition.onend = () => {
      // Auto-restart if user still intended for mic to be active and not speaking
      if (this.isListening) {
        try {
          this.recognition.start();
          return;
        } catch (e) {
          // Ignore start error if already running
        }
      }
      this.isListening = false;
      if (this.onStateChangeCallback) this.onStateChangeCallback(false);
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // User is just quiet, ignore
        return;
      }
      console.warn('Speech recognition event warning:', event.error);
      if (this.onErrorCallback) this.onErrorCallback(event.error);
    };

    this.recognition.onresult = (event) => {
      let currentFinal = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          currentFinal += item[0].transcript + ' ';
        } else {
          currentInterim += item[0].transcript;
        }
      }

      if (currentFinal) {
        this.accumulatedTranscript += currentFinal;
      }
      this.interimTranscript = currentInterim;

      const fullLiveText = (this.accumulatedTranscript + ' ' + this.interimTranscript).trim();

      // Notify caller of live streaming transcript for real-time subtitle display
      if (this.onResultCallback && fullLiveText) {
        this.onResultCallback({
          final: this.accumulatedTranscript.trim(),
          interim: this.interimTranscript.trim(),
          text: fullLiveText,
          isFinalChunk: !!currentFinal,
        });
      }

      // Reset and restart silence debounce timer
      if (fullLiveText.length > 1) {
        this.resetSilenceTimer();
      }
    };
  }

  resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    const pauseMs = aiConfig ? aiConfig.getSpeechPauseMs() : 1400;

    this.silenceTimer = setTimeout(() => {
      this.finalizeUtterance();
    }, pauseMs);
  }

  finalizeUtterance() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const fullUtterance = (this.accumulatedTranscript + ' ' + this.interimTranscript).trim();

    if (fullUtterance.length > 2) {
      this.accumulatedTranscript = '';
      this.interimTranscript = '';

      if (this.onSpeechFinalizedCallback) {
        this.onSpeechFinalizedCallback(fullUtterance);
      }
    }
  }

  flushNow() {
    this.finalizeUtterance();
  }

  startListening(onResult, onSpeechFinalized, onError, onStateChange) {
    this.onResultCallback = onResult;
    this.onSpeechFinalizedCallback = onSpeechFinalized;
    this.onErrorCallback = onError;
    this.onStateChangeCallback = onStateChange;

    this.accumulatedTranscript = '';
    this.interimTranscript = '';

    if (!this.recognition) {
      if (onError) onError('Speech recognition not supported in this browser');
      return;
    }

    try {
      this.recognition.start();
    } catch (e) {
      // Already started
    }
  }

  stopListening() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignored
      }
    }
  }

  /**
   * Speaks a reply with breath-paced prosody.
   *
   * Tries the local Kokoro neural voice first; if the weights are still
   * compiling, the persona has no neural speaker, or synthesis fails, it hands
   * the same conditioned text to the browser synthesiser so the user never
   * hears a dropped reply.
   */
  async speak(text, onEnd, options = {}) {
    const conditioned = conditionForSpeech(text);
    if (!conditioned) {
      onEnd?.();
      return;
    }

    this.stopSpeaking();
    const token = ++this.utteranceToken;

    const profile = aiConfig.getCompanionProfile();
    const personaId = options.personaId || profile.personaId;
    const persona = getPersona(personaId);
    const emotion = options.emotion || 'neutral';
    const urgency = options.urgency || 'normal';

    const finish = () => {
      if (token === this.utteranceToken) onEnd?.();
    };

    if (profile.engine === 'neural' && persona.neuralAvailable) {
      try {
        const played = await kokoroEngine.speak(conditioned, {
          personaId,
          emotion,
          urgency,
          onStart: options.onStart,
          onEnd: finish,
        });
        if (played || token !== this.utteranceToken) return;
      } catch (error) {
        console.warn('Neural voice failed, falling back to browser speech:', error);
        if (token !== this.utteranceToken) return;
      }
    }

    this.speakWithBrowser(conditioned, { persona, emotion, urgency, token, onStart: options.onStart, onEnd: finish });
  }

  /** Web Speech API path. Receives text that is already prosody-conditioned. */
  speakWithBrowser(conditionedText, { persona, emotion, urgency, token, onStart, onEnd }) {
    if (!this.synth) {
      onEnd?.();
      return;
    }

    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(conditionedText);
    const cadence = resolveCadence({ emotion, dialect: persona.dialect, urgency });
    utterance.rate = cadence.rate;
    utterance.pitch = cadence.pitch;
    utterance.volume = cadence.volume;
    utterance.lang = persona.fallbackLang;

    const voice = this.pickBrowserVoice(persona.fallbackLang);
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      if (token === this.utteranceToken) onStart?.();
    };
    utterance.onend = onEnd;
    utterance.onerror = onEnd;

    this.synth.speak(utterance);
  }

  /**
   * Prefers a voice in the persona's own locale, then a high-quality voice in
   * the same base language, before letting the platform pick its default.
   */
  pickBrowserVoice(preferredLang = 'en-US') {
    if (!this.synth) return null;
    const voices = this.synth.getVoices();
    if (!voices.length) return null;

    const baseLang = preferredLang.split('-')[0];
    const isHighQuality = (voice) =>
      /Natural|Neural|Enhanced|Premium|Google|Samantha|Karen|Victoria|Zira|Rishi|Veena/i.test(voice.name);

    return (
      voices.find((voice) => voice.lang.replace('_', '-') === preferredLang && isHighQuality(voice)) ||
      voices.find((voice) => voice.lang.replace('_', '-') === preferredLang) ||
      voices.find((voice) => voice.lang.startsWith(baseLang) && isHighQuality(voice)) ||
      voices.find((voice) => voice.lang.startsWith(baseLang)) ||
      null
    );
  }

  /** Warms the neural weights so the first reply does not wait on a download. */
  preloadNeuralVoice(onProgress) {
    if (aiConfig.getTtsEngine() !== 'neural') return Promise.resolve(null);
    return kokoroEngine.preload(onProgress);
  }

  stopSpeaking() {
    this.utteranceToken += 1;
    kokoroEngine.stop();
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export const speechService = new SpeechService();
