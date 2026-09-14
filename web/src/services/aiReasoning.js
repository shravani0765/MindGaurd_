import {
  buildComfortResponse,
  buildSomaticAdvice,
  fuseWellnessSignals,
} from './wellnessIntelligence';
import { aiConfig } from './aiConfig';
import { buildPersonaPrompt, getArchetype, getRegion } from './archetypes';
import { getLanguage, tierForLevel } from './vernacular';

class MultimodalAIReasoning {
  constructor() {
    this.conversationHistory = [];
  }

  /** Number of user turns so far — drives filler rotation and opener suppression. */
  get turnIndex() {
    return this.conversationHistory.filter((entry) => entry.role === 'user').length;
  }

  /**
   * Synthesizes Voice Transcript, Facial Expression, and Vocal Tone into deep empathetic guidance.
   * @param {string} userSpeech - What the user spoke/typed
   * @param {object} facialData - Real-time facial emotion & tension metrics
   * @param {string} vocalEmotion - Detected voice tone
   */
  async synthesizeAndRespond(userSpeech, facialData = {}, vocalEmotion = 'neutral') {
    const text = (userSpeech || '').trim();
    const previousEmotion = this.conversationHistory.filter((entry) => entry.role === 'user').at(-1)?.emotion;
    const fusion = fuseWellnessSignals({
      text,
      backendEmotion: vocalEmotion,
      vocalEmotion,
      facialData,
      previousEmotion,
    });

    const turn = this.turnIndex;
    const { archetypeId, regionId, languageId, slangLevel } = aiConfig.getCompanionProfile();

    this.conversationHistory.push({
      role: 'user',
      text,
      emotion: fusion.emotion,
      timestamp: Date.now(),
    });

    const comfort = buildComfortResponse({
      text,
      emotion: fusion.emotion,
      urgency: fusion.urgency,
      topicFlags: fusion.topicFlags,
      tension: fusion.tension,
      mode: 'combo',
      archetypeId,
      regionId,
      languageId,
      slangLevel,
      turn,
    });
    const response = `${comfort.message} ${comfort.followUp}`.trim();
    this.conversationHistory.push({ role: 'assistant', text: response, timestamp: Date.now() });

    return {
      fusedEmotion: fusion.emotion,
      confidence: fusion.confidence,
      urgency: fusion.urgency,
      response,
      archetype: getArchetype(archetypeId).label,
      region: getRegion(regionId).label,
      languageId,
      somaticAdvice:
        comfort.somaticAdvice ||
        buildSomaticAdvice({
          emotion: fusion.emotion,
          topicFlags: fusion.topicFlags,
          tension: fusion.tension,
        }),
    };
  }

  /**
   * The persona instructions a server-side or Gemini call should be primed with,
   * so a model-generated reply matches the tone of the local fallback.
   */
  getPersonaPrompt() {
    const { archetypeId, regionId, languageId, slangLevel } = aiConfig.getCompanionProfile();
    const language = getLanguage(languageId);
    const tier = tierForLevel(slangLevel);

    return [
      buildPersonaPrompt({ archetypeId, regionId }),
      `Write in ${language.label} using Latin script code-switching, at a "${tier}" level of familiarity.`,
      'Do not apply casual register to any safety or crisis guidance.',
    ].join(' ');
  }

  reset() {
    this.conversationHistory = [];
  }
}

export const aiReasoningEngine = new MultimodalAIReasoning();
