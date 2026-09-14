// web/src/services/kokoroEngine.js
// In-browser neural text-to-speech built on the Kokoro 82M ONNX model (kokoro-js).
//
// The model runs entirely client-side — WebGPU where available, WASM otherwise —
// so no audio ever leaves the device and there is no per-character cloud cost.
// Everything here degrades safely: if the weights cannot load, `speak()` reports
// failure and the caller (services/speech.js) falls back to the Web Speech API.

import { resolveCadence, splitIntoBreathGroups } from './prosody';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Short cross-fade applied to the head and tail of an utterance. Long enough to
// kill the DC click at buffer boundaries, short enough to be inaudible as a fade.
const EDGE_FADE_SECONDS = 0.012;

// Playback headroom; leaves space for the ambience bed to sit underneath.
const PLAYBACK_VOLUME = 0.95;

/**
 * Character voices offered in the UI.
 *
 * `kokoroVoice` must be a voice id that ships with kokoro-js. Kokoro v1.0 only
 * publishes en-US (af_/am_) and en-GB (bf_/bm_) speakers — it has no Indian
 * English speaker — so the Aaradhya persona is marked `neuralAvailable: false`
 * and is served by the browser's own en-IN voice instead of being silently
 * swapped for an American one.
 */
export const VOICE_PERSONAS = Object.freeze({
  sarah: {
    id: 'sarah',
    label: 'Sarah',
    glyph: '🌸',
    kokoroVoice: 'af_sarah',
    dialect: 'en-US',
    fallbackLang: 'en-US',
    neuralAvailable: true,
    blurb: 'Warm sanctuary presence with a calm grounding cadence.',
  },
  bella: {
    id: 'bella',
    label: 'Bella',
    glyph: '🕊️',
    kokoroVoice: 'af_bella',
    dialect: 'en-US',
    fallbackLang: 'en-US',
    neuralAvailable: true,
    blurb: 'Gentle and deeply empathetic, softer through the mid-range.',
  },
  heart: {
    id: 'heart',
    label: 'Heart',
    glyph: '💗',
    kokoroVoice: 'af_heart',
    dialect: 'en-US',
    fallbackLang: 'en-US',
    neuralAvailable: true,
    blurb: 'The most natural Kokoro speaker. A good default if you are unsure.',
  },
  emma: {
    id: 'emma',
    label: 'Emma',
    glyph: '🍵',
    kokoroVoice: 'bf_emma',
    dialect: 'en-GB',
    fallbackLang: 'en-GB',
    neuralAvailable: true,
    blurb: 'British, poised and thoughtful, with a reflective pace.',
  },
  michael: {
    id: 'michael',
    label: 'Michael',
    glyph: '🌲',
    kokoroVoice: 'am_michael',
    dialect: 'en-US',
    fallbackLang: 'en-US',
    neuralAvailable: true,
    blurb: 'Mellow, resonant masculine tone for a steady presence.',
  },
  aaradhya: {
    id: 'aaradhya',
    label: 'Aaradhya',
    glyph: '🪷',
    kokoroVoice: null,
    dialect: 'en-IN',
    fallbackLang: 'en-IN',
    neuralAvailable: false,
    blurb: 'Indian English warmth. Uses your device voice — Kokoro has no en-IN speaker yet.',
  },
});

export const DEFAULT_PERSONA_ID = 'heart';

export function getPersona(personaId) {
  return VOICE_PERSONAS[personaId] || VOICE_PERSONAS[DEFAULT_PERSONA_ID];
}

class KokoroEngine {
  constructor() {
    /** @type {'idle'|'loading'|'ready'|'unavailable'} */
    this.status = 'idle';
    this.tts = null;
    this.device = null;
    this.loadError = null;
    this.progress = 0;

    this.audioContext = null;
    this.masterGain = null;
    this.activeSources = [];
    this.playbackToken = 0;

    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return {
      status: this.status,
      device: this.device,
      progress: this.progress,
      error: this.loadError,
    };
  }

  _emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('Kokoro listener error:', error);
      }
    });
  }

  isSupported() {
    return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  async _detectDevice() {
    if (typeof navigator !== 'undefined' && navigator.gpu?.requestAdapter) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) return 'webgpu';
      } catch {
        // WebGPU present but unusable (e.g. blocklisted driver) — fall through to WASM.
      }
    }
    return 'wasm';
  }

  /**
   * Downloads and compiles the model. Safe to call repeatedly: concurrent callers
   * share one in-flight promise, and a resolved engine is returned immediately.
   */
  async preload(onProgress) {
    if (this.status === 'ready') return this.tts;
    if (this.status === 'unavailable') return null;
    if (this._loadPromise) return this._loadPromise;

    if (!this.isSupported()) {
      this.status = 'unavailable';
      this.loadError = 'This browser cannot run WebAssembly.';
      this._emit();
      return null;
    }

    this.status = 'loading';
    this.progress = 0;
    this._emit();

    this._loadPromise = (async () => {
      try {
        const { KokoroTTS } = await import('kokoro-js');
        const device = await this._detectDevice();

        this.tts = await KokoroTTS.from_pretrained(MODEL_ID, {
          // q8 keeps the download near 90MB and is indistinguishable from fp32
          // for speech at 24kHz; fp32 on WASM is slow enough to feel broken.
          dtype: device === 'webgpu' ? 'fp32' : 'q8',
          device,
          progress_callback: (event) => {
            if (event?.status === 'progress' && typeof event.progress === 'number') {
              this.progress = Math.round(event.progress);
              this._emit();
              onProgress?.(this.progress);
            }
          },
        });

        this.device = device;
        this.status = 'ready';
        this.progress = 100;
        this._emit();
        return this.tts;
      } catch (error) {
        console.warn('Kokoro neural voice unavailable, using browser speech instead:', error);
        this.status = 'unavailable';
        this.loadError = error?.message || 'Unable to load the neural voice model.';
        this.tts = null;
        this._emit();
        return null;
      } finally {
        this._loadPromise = null;
      }
    })();

    return this._loadPromise;
  }

  _resolveVoiceId(personaId) {
    const persona = getPersona(personaId);
    if (!persona.kokoroVoice || !this.tts) return null;
    // Guard against a persona pointing at a voice a future kokoro-js drops.
    return persona.kokoroVoice in this.tts.voices ? persona.kokoroVoice : null;
  }

  /** True when this persona can actually be rendered by the neural model right now. */
  canSpeakAs(personaId) {
    return this.status === 'ready' && Boolean(this._resolveVoiceId(personaId));
  }

  _ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContextCtor();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  /**
   * Synthesises and plays `text`.
   *
   * Clauses are generated one at a time and scheduled back-to-back on the audio
   * clock, so the first words start playing while later ones are still being
   * generated and no gap opens up between them.
   *
   * @returns {Promise<boolean>} true if the neural voice played the whole line.
   */
  async speak(text, { personaId = DEFAULT_PERSONA_ID, emotion = 'neutral', urgency = 'normal', onStart, onEnd } = {}) {
    const persona = getPersona(personaId);
    const groups = splitIntoBreathGroups(text);
    if (!groups.length) {
      onEnd?.();
      return true;
    }

    // A cold model load can take tens of seconds. If anything cancelled playback
    // in the meantime, drop this utterance instead of speaking over the user.
    const entryToken = this.playbackToken;
    await this.preload();
    if (this.playbackToken !== entryToken) return true;

    const voiceId = this._resolveVoiceId(persona.id);
    if (!voiceId) return false;

    const context = this._ensureAudioContext();
    if (!context) return false;
    if (context.state === 'suspended') {
      // Autoplay policy: resume must happen inside the user-gesture-derived task.
      await context.resume().catch(() => {});
    }

    this.stop();
    const token = ++this.playbackToken;

    const cadence = resolveCadence({ emotion, dialect: persona.dialect, urgency });

    let cursor = context.currentTime + 0.08; // small lead-in so the first chunk is never clipped
    let started = false;
    let lastSource = null;

    try {
      for (const group of groups) {
        if (token !== this.playbackToken) return true; // superseded by a newer utterance

        const raw = await this.tts.generate(group, { voice: voiceId, speed: cadence.rate });
        if (token !== this.playbackToken) return true;

        const samples = raw.audio ?? raw.data;
        const sampleRate = raw.sampling_rate ?? 24000;
        if (!samples?.length) continue;

        const buffer = context.createBuffer(1, samples.length, sampleRate);
        buffer.copyToChannel(samples instanceof Float32Array ? samples : Float32Array.from(samples), 0);

        const source = context.createBufferSource();
        source.buffer = buffer;
        // Kokoro's own `speed` already handles pace; detune only shapes the contour.
        source.detune.value = (cadence.pitch - 1) * 1200;
        source.connect(this.masterGain);

        // Never schedule in the past — a stalled generate() would otherwise
        // cause the remaining clauses to all fire at once.
        const startAt = Math.max(cursor, context.currentTime + 0.01);
        source.start(startAt);
        cursor = startAt + buffer.duration;

        this.activeSources.push(source);
        lastSource = source;

        if (!started) {
          started = true;
          this._applyEdgeFade(context, startAt, cadence.volume);
          onStart?.();
        }
      }

      if (!started) {
        onEnd?.();
        return true;
      }

      this.masterGain.gain.setValueAtTime(cadence.volume, Math.max(cursor - EDGE_FADE_SECONDS, context.currentTime));
      this.masterGain.gain.linearRampToValueAtTime(0.0001, cursor);

      await new Promise((resolve) => {
        lastSource.onended = resolve;
      });

      if (token === this.playbackToken) {
        this.activeSources = [];
        onEnd?.();
      }
      return true;
    } catch (error) {
      console.warn('Kokoro synthesis failed mid-utterance:', error);
      this.stop();
      // Partial audio already played, so restarting from the top would repeat
      // words — release the caller instead and let it return to idle.
      if (started) onEnd?.();
      return started;
    }
  }

  /** Ramps in from silence so the first buffer cannot produce a DC click. */
  _applyEdgeFade(context, startAt, volume = PLAYBACK_VOLUME) {
    this.masterGain.gain.cancelScheduledValues(startAt);
    this.masterGain.gain.setValueAtTime(0.0001, startAt);
    this.masterGain.gain.linearRampToValueAtTime(volume, startAt + EDGE_FADE_SECONDS);
  }

  stop() {
    this.playbackToken += 1;
    this.activeSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Already finished.
      }
    });
    this.activeSources = [];
  }
}

export const kokoroEngine = new KokoroEngine();
