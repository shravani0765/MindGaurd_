// web/src/services/geminiClient.js
// Generates the companion's actual reply with Google Gemini.
//
// Before this existed, every reply came from a fixed template in
// wellnessIntelligence.js. "I am happy" and "I am sad" each mapped to one
// hard-coded paragraph, so the companion repeated itself and sounded like it
// was not listening. Templates remain as the offline fallback.
//
// SAFETY CONTRACT — read before changing anything here:
//   1. A high-urgency or self-harm turn NEVER reaches the model. It returns
//      null immediately so the reviewed crisis template is used verbatim.
//   2. If Gemini's own safety filter blocks the response, we fall back to the
//      template rather than showing nothing.
//   3. The model is instructed never to diagnose, prescribe, or promise
//      outcomes, and is given a hard length limit.

import { aiConfig } from './aiConfig';
import { apiClient } from './api';
import { getArchetype, getRegion } from './archetypes';
import { getLanguage, tierForLevel } from './vernacular';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 9000;
const MAX_REPLY_CHARS = 420;

// Mental-health language trips consumer safety filters, so relax the
// categories that would otherwise block a legitimate supportive reply. Kept at
// BLOCK_ONLY_HIGH rather than BLOCK_NONE: genuinely harmful output is still
// refused, and the crisis path never reaches the model anyway.
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

/** Rolling dialogue memory, so the reply can refer back to what was said. */
const history = [];
const MAX_HISTORY_TURNS = 8;

export function rememberTurn(role, text) {
  if (!text?.trim()) return;
  history.push({ role, text: text.trim() });
  while (history.length > MAX_HISTORY_TURNS) history.shift();
}

export function resetConversation() {
  history.length = 0;
}

/**
 * Whether *some* generation path is available.
 *
 * The backend key cannot be detected from here without a request, so this is
 * optimistic: it reports true unless the server has told us it is offline. The
 * reply badge shows what actually happened for each turn.
 */
let backendAvailable = true;

export function isGeminiConfigured() {
  return backendAvailable || Boolean(aiConfig.getGeminiKey());
}

/** Persona context the server needs to write in the user's own register. */
function buildContext() {
  const { archetypeId, regionId, languageId, slangLevel } = aiConfig.getCompanionProfile();
  const archetype = getArchetype(archetypeId);

  return {
    archetypeLabel: archetype.label,
    archetypeSummary: archetype.summary,
    archetypeTone: archetype.promptModifier,
    regionLabel: getRegion(regionId).label,
    languageLabel: getLanguage(languageId).label,
    warmthTier: tierForLevel(slangLevel),
  };
}

/**
 * Builds the system instruction: who the companion is, how it should sound for
 * this user, and what it must not do.
 */
function buildSystemInstruction({ emotion, topicFlags }) {
  const { archetypeId, regionId, languageId, slangLevel } = aiConfig.getCompanionProfile();
  const archetype = getArchetype(archetypeId);
  const region = getRegion(regionId);
  const language = getLanguage(languageId);
  const tier = tierForLevel(slangLevel);
  const persona = aiConfig.getPersona();

  const tierGuidance = {
    formal: 'Speak warmly but properly. No slang.',
    friendly: 'Speak like a close friend. Light, natural contractions are good.',
    home: 'Speak like family. Use the everyday code-switched phrasing people actually text in.',
  }[tier];

  return [
    'You are MindGuard, a wellbeing companion for a check-in conversation. You are not a therapist.',
    '',
    'WHO YOU ARE TALKING TO:',
    `- Archetype: ${archetype.label}. ${archetype.summary}`,
    `- Tone required: ${archetype.promptModifier}`,
    `- Their pace: ${archetype.pacing}`,
    '',
    'HOW TO SOUND:',
    `- Write in ${language.label}, in Latin script only. ${tierGuidance}`,
    `- Regional register: ${region.label}.`,
    `- Detected feeling: ${emotion}. Respond to THIS, specifically. Do not give a generic answer.`,
    `- Selected persona style: ${persona}.`,
    '',
    'RULES:',
    '- 2 to 4 sentences. Never longer. This will be spoken aloud.',
    '- Reflect back something concrete they actually said, so they know you listened.',
    '- End with ONE short question, or one small invitation. Never a list.',
    '- Use "..." only for a real pause.',
    '- Plain sentences only. No markdown, no bullet points, no emoji, no headings.',
    '- Never diagnose, never name a disorder, never suggest medication.',
    '- Never promise an outcome. Never say you understand exactly how they feel.',
    '- If they sound good, be genuinely pleased and help them notice what caused it. Do not flatten a good mood into generic advice.',
    topicFlags?.celebration ? '- They are celebrating something. Match that energy.' : '',
    topicFlags?.workPressure ? '- Work pressure is present. Help them shrink the load, not push harder.' : '',
    topicFlags?.loneliness ? '- They feel disconnected. Warmth matters more than advice here.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Asks Gemini for a reply.
 *
 * @returns {Promise<{text: string, model: string}|null>} null whenever the
 *   caller should use the template instead — no key, crisis turn, blocked
 *   response, timeout, or any error.
 */
export async function generateReply({
  userText,
  emotion = 'neutral',
  urgency = 'normal',
  topicFlags = {},
  somaticAdvice = '',
}) {
  // (1) Safety contract: crisis turns never reach the model.
  if (urgency === 'high' || topicFlags.selfHarm) return null;
  if (!userText?.trim()) return null;

  // (2) Preferred path: the server holds the key.
  try {
    const result = await apiClient.generateCompanionReply({
      text: userText.trim(),
      context: buildContext(),
      analysis: { emotion, urgency, topicFlags },
      history: history.slice(-8),
    });

    if (result?.source === 'gemini' && result.reply) {
      backendAvailable = true;
      return { text: sanitizeReply(result.reply, somaticAdvice), model: result.model };
    }
    // 'not-configured' means no server key; anything else is transient.
    if (result?.reason === 'not-configured') backendAvailable = false;
  } catch (error) {
    console.warn('Companion endpoint failed, trying local key:', error);
  }

  // (3) Local-key fallback, for development without a backend.
  const key = aiConfig.getGeminiKey();
  if (!key) return null;

  const model = aiConfig.getModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemInstruction({ emotion, topicFlags }) }] },
          contents: [
            ...history.map((turn) => ({
              role: turn.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: turn.text }],
            })),
            { role: 'user', parts: [{ text: userText.trim() }] },
          ],
          generationConfig: {
            // Warm and varied, but not so loose that it invents advice.
            temperature: 0.9,
            topP: 0.95,
            maxOutputTokens: 200,
          },
          safetySettings: SAFETY_SETTINGS,
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      console.warn(
        `Gemini ${response.status}: ${detail?.error?.message || 'request failed'} — using local reply.`
      );
      return null;
    }

    const data = await response.json();

    // (2) Blocked by Gemini's own filter.
    if (data.promptFeedback?.blockReason) {
      console.warn('Gemini blocked the prompt:', data.promptFeedback.blockReason);
      return null;
    }

    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY') {
      console.warn('Gemini returned no usable candidate:', candidate?.finishReason);
      return null;
    }

    const text = (candidate.content?.parts || [])
      .map((part) => part.text || '')
      .join(' ')
      .trim();
    if (!text) return null;

    return { text: sanitizeReply(text, somaticAdvice), model };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Gemini timed out — using local reply.');
    } else {
      console.warn('Gemini request failed — using local reply:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Strips anything that would be read aloud badly, and enforces the length cap
 * the model is asked for but does not always respect.
 */
function sanitizeReply(text, somaticAdvice) {
  let output = text
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (output.length > MAX_REPLY_CHARS) {
    // Cut at the last sentence boundary inside the budget so it never ends mid-word.
    const clipped = output.slice(0, MAX_REPLY_CHARS);
    const lastStop = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('?'), clipped.lastIndexOf('!'));
    output = lastStop > 80 ? clipped.slice(0, lastStop + 1) : `${clipped.trim()}.`;
  }

  // Keep the grounding cue if the model dropped it and there is room.
  if (somaticAdvice && output.length + somaticAdvice.length < MAX_REPLY_CHARS && !/breath|shoulder|jaw|feet/i.test(output)) {
    output = `${output} ${somaticAdvice}`;
  }

  return output;
}

/** Verifies a key and model actually work, for the settings screen. */
export async function testGeminiConnection(keyToTest, modelToTest) {
  const key = (keyToTest || aiConfig.getGeminiKey()).trim();
  const model = modelToTest || aiConfig.getModel();
  if (!key) return { success: false, message: 'Paste your Gemini API key first.' };

  try {
    const response = await fetch(
      `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: Connected' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `HTTP ${response.status}`;
      if (/not found|not supported/i.test(message)) {
        return { success: false, message: `Model "${model}" is unavailable for this key. Try another model.` };
      }
      if (/API key not valid|API_KEY_INVALID/i.test(message)) {
        return { success: false, message: 'That API key was rejected. Check you copied all of it.' };
      }
      return { success: false, message };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text
      ? { success: true, message: `Connected to ${model}.` }
      : { success: false, message: 'Unexpected response shape from Gemini.' };
  } catch (error) {
    return { success: false, message: `Network error: ${error.message}` };
  }
}
