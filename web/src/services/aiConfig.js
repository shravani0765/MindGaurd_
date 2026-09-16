// web/src/services/aiConfig.js
// Persistent configuration management for AI Engine, Gemini API, Personas, and Speech settings

import { DEFAULT_PERSONA_ID, VOICE_PERSONAS } from './kokoroEngine';
import { ARCHETYPES, DEFAULT_ARCHETYPE_ID, DEFAULT_REGION_ID, REGIONS } from './archetypes';
import { DEFAULT_LANGUAGE_ID, DEFAULT_SLANG_LEVEL, LANGUAGES } from './vernacular';

export const AI_PERSONAS = {
  empathetic: {
    id: 'empathetic',
    name: 'Empathetic Counselor',
    description: 'Warm, compassionate, validation-focused, and psychologically grounding.',
    badge: 'Compassionate',
    promptModifier: 'Speak with profound warmth, unconditional emotional validation, psychological attunement, and gentle grounding.',
  },
  mindful: {
    id: 'mindful',
    name: 'Mindful Coach',
    description: 'Focuses on present-moment awareness, somatic breathwork, and non-judgmental witnessing.',
    badge: 'Mindful',
    promptModifier: 'Emphasize breath awareness, somatic presence, nervous system regulation, and mindfulness witnessing.',
  },
  sadhguru: {
    id: 'sadhguru',
    name: 'Sadhguru Zen Master',
    description: 'Spiritual perspective, witnessing consciousness, and dissolving mental friction into joy.',
    badge: 'Spiritual',
    promptModifier: 'Speak with the wisdom, clarity, and joyful wit of Sadhguru: remind the user that they are neither the body nor the mind, but the boundless conscious witness.',
  },
  solution: {
    id: 'solution',
    name: 'Solution Strategist',
    description: 'Structured CBT reframing, actionable micro-steps, and overcoming cognitive paralysis.',
    badge: 'Action-Oriented',
    promptModifier: 'Combine deep psychological empathy with clear, actionable cognitive reframing (CBT) and pragmatic step-by-step clarity.',
  },
};

const STORAGE_KEYS = {
  GEMINI_KEY: 'mindguard_gemini_api_key',
  PROVIDER: 'mindguard_ai_provider', // 'gemini' | 'local'
  MODEL: 'mindguard_gemini_model', // 'gemini-1.5-flash' | 'gemini-2.0-flash'
  PERSONA: 'mindguard_ai_persona',
  SPEECH_PAUSE_MS: 'mindguard_speech_pause_ms',
  VOICE_PERSONA: 'mindguard_voice_persona',
  TTS_ENGINE: 'mindguard_tts_engine', // 'neural' | 'browser'
  ARCHETYPE: 'mindguard_user_archetype',
  REGION: 'mindguard_user_region',
  ONBOARDED: 'mindguard_onboarding_complete',
  LANGUAGE: 'mindguard_vernacular_language',
  SLANG_LEVEL: 'mindguard_slang_level',
};

class AIConfigService {
  constructor() {
    this.listeners = new Set();
  }

  getGeminiKey() {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem(STORAGE_KEYS.GEMINI_KEY);
    if (stored) return stored.trim();
    return (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  }

  setGeminiKey(key) {
    if (typeof window === 'undefined') return;
    if (key && key.trim()) {
      localStorage.setItem(STORAGE_KEYS.GEMINI_KEY, key.trim());
      this.setProvider('gemini');
    } else {
      localStorage.removeItem(STORAGE_KEYS.GEMINI_KEY);
      this.setProvider('local');
    }
    this.notify();
  }

  getProvider() {
    if (typeof window === 'undefined') return 'local';
    const hasKey = !!this.getGeminiKey();
    const stored = localStorage.getItem(STORAGE_KEYS.PROVIDER);
    if (stored === 'gemini' && hasKey) return 'gemini';
    if (!hasKey) return 'local';
    return stored || 'gemini';
  }

  setProvider(provider) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
    this.notify();
  }

  getModel() {
    if (typeof window === 'undefined') return 'gemini-2.5-flash';
    return localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
  }

  setModel(model) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.MODEL, model);
    this.notify();
  }

  getPersona() {
    if (typeof window === 'undefined') return 'empathetic';
    return localStorage.getItem(STORAGE_KEYS.PERSONA) || 'empathetic';
  }

  setPersona(personaId) {
    if (typeof window === 'undefined') return;
    if (AI_PERSONAS[personaId]) {
      localStorage.setItem(STORAGE_KEYS.PERSONA, personaId);
      this.notify();
    }
  }

  getSpeechPauseMs() {
    if (typeof window === 'undefined') return 1400;
    const val = parseInt(localStorage.getItem(STORAGE_KEYS.SPEECH_PAUSE_MS), 10);
    return isNaN(val) ? 1400 : Math.max(700, Math.min(3000, val));
  }

  setSpeechPauseMs(ms) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SPEECH_PAUSE_MS, ms.toString());
    this.notify();
  }

  getVoicePersona() {
    if (typeof window === 'undefined') return DEFAULT_PERSONA_ID;
    const stored = localStorage.getItem(STORAGE_KEYS.VOICE_PERSONA);
    return VOICE_PERSONAS[stored] ? stored : DEFAULT_PERSONA_ID;
  }

  setVoicePersona(personaId) {
    if (typeof window === 'undefined' || !VOICE_PERSONAS[personaId]) return;
    localStorage.setItem(STORAGE_KEYS.VOICE_PERSONA, personaId);
    this.notify();
  }

  getTtsEngine() {
    if (typeof window === 'undefined') return 'neural';
    return localStorage.getItem(STORAGE_KEYS.TTS_ENGINE) === 'browser' ? 'browser' : 'neural';
  }

  setTtsEngine(engine) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TTS_ENGINE, engine === 'browser' ? 'browser' : 'neural');
    this.notify();
  }

  getArchetype() {
    if (typeof window === 'undefined') return DEFAULT_ARCHETYPE_ID;
    const stored = localStorage.getItem(STORAGE_KEYS.ARCHETYPE);
    return ARCHETYPES[stored] ? stored : DEFAULT_ARCHETYPE_ID;
  }

  setArchetype(archetypeId) {
    if (typeof window === 'undefined' || !ARCHETYPES[archetypeId]) return;
    localStorage.setItem(STORAGE_KEYS.ARCHETYPE, archetypeId);
    this.notify();
  }

  getRegion() {
    if (typeof window === 'undefined') return DEFAULT_REGION_ID;
    const stored = localStorage.getItem(STORAGE_KEYS.REGION);
    return REGIONS[stored] ? stored : DEFAULT_REGION_ID;
  }

  setRegion(regionId) {
    if (typeof window === 'undefined' || !REGIONS[regionId]) return;
    localStorage.setItem(STORAGE_KEYS.REGION, regionId);
    this.notify();
  }

  getLanguage() {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE_ID;
    const stored = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    return LANGUAGES[stored] ? stored : DEFAULT_LANGUAGE_ID;
  }

  setLanguage(languageId) {
    if (typeof window === 'undefined' || !LANGUAGES[languageId]) return;
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, languageId);
    this.notify();
  }

  /** Warmth slider position, 0 (formal) to 100 (home comfort). */
  getSlangLevel() {
    if (typeof window === 'undefined') return DEFAULT_SLANG_LEVEL;
    const value = parseInt(localStorage.getItem(STORAGE_KEYS.SLANG_LEVEL), 10);
    return Number.isNaN(value) ? DEFAULT_SLANG_LEVEL : Math.max(0, Math.min(100, value));
  }

  setSlangLevel(level) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SLANG_LEVEL, String(Math.max(0, Math.min(100, Number(level) || 0))));
    this.notify();
  }

  /** The bundle every voice/reasoning call needs, resolved in one read. */
  getCompanionProfile() {
    return {
      archetypeId: this.getArchetype(),
      regionId: this.getRegion(),
      personaId: this.getVoicePersona(),
      engine: this.getTtsEngine(),
      languageId: this.getLanguage(),
      slangLevel: this.getSlangLevel(),
    };
  }

  isOnboarded() {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(STORAGE_KEYS.ONBOARDED) === 'true';
  }

  completeOnboarding({ archetypeId, regionId, personaId, languageId, slangLevel } = {}) {
    if (typeof window === 'undefined') return;
    if (archetypeId) this.setArchetype(archetypeId);
    if (regionId) this.setRegion(regionId);
    if (personaId) this.setVoicePersona(personaId);
    if (languageId) this.setLanguage(languageId);
    if (slangLevel !== undefined) this.setSlangLevel(slangLevel);
    localStorage.setItem(STORAGE_KEYS.ONBOARDED, 'true');
    this.notify();
  }

  resetOnboarding() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEYS.ONBOARDED);
    this.notify();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this);
      } catch (e) {
        console.error('Config subscriber error:', e);
      }
    });
  }

  async testGeminiKey(keyToTest) {
    const key = (keyToTest || this.getGeminiKey()).trim();
    if (!key) {
      return { success: false, message: 'Please enter a valid Gemini API Key.' };
    }

    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + this.getModel() + ':generateContent?key=' + key;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with the single word: Connected' }] }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: errData.error?.message || ('API returned status ' + response.status),
        };
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return { success: true, message: 'Successfully connected to Google Gemini AI!' };
      }
      return { success: false, message: 'Received unexpected response format from Gemini API.' };
    } catch (e) {
      return { success: false, message: 'Network error: ' + e.message };
    }
  }
}

export const aiConfig = new AIConfigService();
