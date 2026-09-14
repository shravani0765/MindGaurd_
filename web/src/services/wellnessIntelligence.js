import {
  DEFAULT_ARCHETYPE_ID,
  DEFAULT_REGION_ID,
  applyPersonaVoice,
  personaFollowUp,
  regionalGrounding,
} from './archetypes';

const EMOTIONS = ['calm', 'happy', 'neutral', 'fatigued', 'anxious', 'stressed', 'sad'];

const EMOTION_PATTERNS = {
  stressed: [
    ['burnout', 3.2],
    ['deadline', 2.8],
    ['overwhelmed', 3.1],
    ['overwhelm', 3.1],
    ['too much', 2.4],
    ['pressure', 2.2],
    ['workload', 2.4],
    ['unmanageable', 2.5],
    ['panic', 2.8],
    ['spiraling', 2.6],
  ],
  anxious: [
    ['anxious', 3.2],
    ['worried', 2.4],
    ['nervous', 2.2],
    ['presentation', 1.6],
    ['racing thoughts', 2.8],
    ['scared', 2.6],
    ['restless', 1.8],
    ['can’t switch off', 2.4],
    ['cannot switch off', 2.4],
  ],
  fatigued: [
    ['tired', 2.6],
    ['exhausted', 3.1],
    ['drained', 2.8],
    ['no energy', 2.7],
    ['heavy', 1.8],
    ['sleepy', 2.2],
    ['worn out', 2.7],
    ['back-to-back meetings', 2.8],
  ],
  happy: [
    ['happy', 2.7],
    ['great', 2.1],
    ['good', 1.6],
    ['grateful', 2.6],
    ['proud', 2.6],
    ['relieved', 1.9],
    ['achieved', 2.3],
    ['milestone', 2.4],
    ['celebrate', 2.4],
  ],
  calm: [
    ['calm', 2.8],
    ['peaceful', 2.8],
    ['steady', 2.1],
    ['grounded', 2.7],
    ['rested', 2.4],
    ['clear-headed', 2.3],
    ['settled', 2.1],
  ],
  sad: [
    ['sad', 2.8],
    ['low', 1.8],
    ['lonely', 2.8],
    ['alone', 2.5],
    ['empty', 2.4],
    ['numb', 2.2],
    ['disconnected', 2.1],
  ],
};

const INTENSIFIERS = ['very', 'really', 'extremely', 'so', 'deeply', 'totally', 'completely'];
const SOFTENERS = ['a bit', 'slightly', 'kind of', 'somewhat', 'a little'];

const TOPIC_PATTERNS = {
  workPressure: ['work', 'deadline', 'boss', 'meeting', 'workload', 'task', 'project', 'presentation'],
  sleepDepletion: ['sleep', 'rest', 'exhausted', 'tired', 'drained', 'no energy'],
  grounding: ['breathe', 'breathing', 'calm me down', 'grounding', 'panic', 'racing thoughts'],
  celebration: ['achieved', 'milestone', 'great', 'proud', 'happy', 'grateful'],
  loneliness: ['alone', 'lonely', 'isolated', 'disconnected'],
  selfHarm: ['hurt myself', 'end it all', 'want to disappear', 'not worth living', 'kill myself'],
};

export function normalizeEmotion(value) {
  const normalized = (value || 'neutral').toLowerCase();
  if (normalized === 'relaxed') return 'calm';
  if (normalized === 'distressed') return 'stressed';
  if (EMOTIONS.includes(normalized)) return normalized;
  return 'neutral';
}

export function analyzeTextSignals(text, baselineEmotion = 'neutral') {
  const content = (text || '').trim().toLowerCase();
  const scores = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0.45]));
  const topicFlags = buildTopicFlags(content);

  scores[normalizeEmotion(baselineEmotion)] += 0.9;
  scores.neutral += 0.6;

  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    patterns.forEach(([pattern, weight]) => {
      if (content.includes(pattern)) {
        scores[emotion] += applyIntensity(content, weight);
      }
    });
  }

  if (topicFlags.workPressure) scores.stressed += 0.8;
  if (topicFlags.sleepDepletion) scores.fatigued += 0.9;
  if (topicFlags.grounding) scores.anxious += 0.9;
  if (topicFlags.loneliness) scores.sad += 0.9;
  if (topicFlags.celebration) scores.happy += 0.8;
  if (topicFlags.selfHarm) scores.stressed += 2.4;

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const primaryEmotion = normalizeEmotion(ranked[0][0]);
  const secondaryEmotion = normalizeEmotion(ranked[1][0]);
  const confidence = clamp(0.58 + (ranked[0][1] - ranked[1][1]) / 6, 0.58, 0.97);
  const urgency = topicFlags.selfHarm ? 'high' : topicFlags.grounding && content.includes('panic') ? 'elevated' : 'normal';

  return {
    emotion: primaryEmotion,
    secondaryEmotion,
    confidence,
    urgency,
    topicFlags,
    supportStyle: pickSupportStyle(primaryEmotion, topicFlags),
    scores,
  };
}

export function fuseWellnessSignals({
  text = '',
  backendEmotion = 'neutral',
  vocalEmotion = 'neutral',
  facialData = {},
  previousEmotion = 'neutral',
}) {
  const textInsights = analyzeTextSignals(text, backendEmotion);
  const scores = { ...textInsights.scores };
  const faceEmotion = normalizeEmotion(facialData.emotion || previousEmotion);
  const voiceEmotion = normalizeEmotion(vocalEmotion);
  const tension = facialData.tension || 20;
  const fatigue = facialData.fatigue || 20;
  const valence = facialData.valence || 50;

  scores[voiceEmotion] += 1.1;
  scores[faceEmotion] += 0.95;
  scores[normalizeEmotion(previousEmotion)] += 0.35;

  if (tension >= 65) scores.stressed += 1.6;
  if (fatigue >= 60) scores.fatigued += 1.6;
  if (valence >= 78) scores.happy += 0.9;
  if (valence <= 38) scores.sad += 0.9;

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const emotion = normalizeEmotion(ranked[0][0]);
  const confidence = clamp(
    0.62 + (ranked[0][1] - ranked[1][1]) / 7 + (tension > 60 || fatigue > 60 ? 0.04 : 0),
    0.6,
    0.98
  );

  return {
    emotion,
    confidence,
    topicFlags: textInsights.topicFlags,
    urgency: textInsights.urgency,
    supportStyle: pickSupportStyle(emotion, textInsights.topicFlags),
    tension,
    fatigue,
    valence,
  };
}

function buildBaseComfortResponse({
  text: _text = '',
  emotion = 'neutral',
  urgency = 'normal',
  topicFlags = {},
  tension = 20,
  mode = 'text',
}) {
  const normalizedEmotion = normalizeEmotion(emotion);
  const followUp = pickFollowUp(normalizedEmotion, topicFlags);
  const somaticAdvice = buildSomaticAdvice({ emotion: normalizedEmotion, topicFlags, tension });

  if (urgency === 'high') {
    return {
      message:
        "I'm really glad you said that. You deserve immediate human support right now. Please contact a trusted person or local emergency service now, and stay near someone if you can while this wave passes.",
      followUp: 'While you reach out, can you place both feet on the floor and take one slow exhale?',
      somaticAdvice,
      supportNotice: 'If you feel at risk of acting on these thoughts, call local emergency services now.',
    };
  }

  if (topicFlags.grounding && normalizedEmotion !== 'happy') {
    return {
      message:
        'We can slow this down together. Nothing has to be solved in one moment. Let your jaw loosen, drop your shoulders a little, and take one slow breath before the next thought.',
      followUp,
      somaticAdvice,
    };
  }

  if (topicFlags.workPressure && normalizedEmotion !== 'happy') {
    return {
      message:
        'That sounds like a lot to carry at once. Let us make the load smaller instead of pushing harder. Choose the single next task that matters most, and allow everything else to wait for a moment.',
      followUp,
      somaticAdvice,
    };
  }

  if (normalizedEmotion === 'fatigued') {
    return {
      message:
        'You sound depleted rather than unmotivated, and that difference matters. A brief pause, water, and softer pacing will help your mind more than forcing more output right now.',
      followUp,
      somaticAdvice,
    };
  }

  if (normalizedEmotion === 'happy' || topicFlags.celebration) {
    return {
      message:
        'There is some genuine relief and lightness here. It is worth pausing long enough to notice what helped, because those patterns are exactly what we want to repeat.',
      followUp,
      somaticAdvice,
    };
  }

  if (topicFlags.loneliness || normalizedEmotion === 'sad') {
    return {
      message:
        'Feeling disconnected can make everything heavier. You do not need to explain it perfectly here. We can stay with one honest sentence at a time and build from there.',
      followUp,
      somaticAdvice,
    };
  }

  const reflectiveLead =
    mode === 'voice'
      ? 'Thank you for saying that out loud.'
      : 'Thank you for putting that into words.';

  return {
    message: `${reflectiveLead} We can keep this gentle and practical. I’m noticing some strain, and we can respond with steadier pacing instead of more pressure.`,
    followUp,
    somaticAdvice,
  };
}

/**
 * Builds the reply the companion actually says.
 *
 * The clinical content comes from `buildBaseComfortResponse`; the archetype and
 * region only decide how it is opened, paced, and closed. A high-urgency reply
 * is returned untouched so safety wording is identical for every user.
 */
export function buildComfortResponse({
  archetypeId = DEFAULT_ARCHETYPE_ID,
  regionId = DEFAULT_REGION_ID,
  turn = 0,
  ...signals
}) {
  const base = buildBaseComfortResponse(signals);
  const urgency = signals.urgency || 'normal';

  if (urgency === 'high') return base;

  const normalizedEmotion = normalizeEmotion(signals.emotion);
  // An opener re-states what the user is going through, which is grounding on a
  // hard turn but patronising on a good one.
  const withOpener = turn === 0 && !['happy', 'calm'].includes(normalizedEmotion);

  return {
    ...base,
    message: applyPersonaVoice(base.message, { archetypeId, regionId, urgency, turn, withOpener }),
    followUp: personaFollowUp(archetypeId, base.followUp),
    somaticAdvice: shouldUseRegionalGrounding(normalizedEmotion, signals.topicFlags)
      ? regionalGrounding(regionId)
      : base.somaticAdvice,
  };
}

function shouldUseRegionalGrounding(emotion, topicFlags = {}) {
  return Boolean(topicFlags.grounding) || emotion === 'anxious' || emotion === 'stressed';
}

export function buildSomaticAdvice({ emotion = 'neutral', topicFlags = {}, tension = 20 }) {
  if (topicFlags.grounding || emotion === 'anxious' || emotion === 'stressed' || tension > 55) {
    return 'Try one grounding cycle: relax your jaw, exhale longer than you inhale, and feel both feet press into the floor.';
  }

  if (emotion === 'fatigued') {
    return 'Look away from the screen for 20 seconds, blink slowly, and take a sip of water before restarting.';
  }

  if (emotion === 'happy' || emotion === 'calm') {
    return 'Notice what already feels supportive right now so you can return to it later with less effort.';
  }

  return 'Keep your breathing unforced and your shoulders loose while you answer the next question.';
}

function buildTopicFlags(content) {
  const flags = {};
  Object.entries(TOPIC_PATTERNS).forEach(([flag, patterns]) => {
    flags[flag] = patterns.some((pattern) => content.includes(pattern));
  });
  return flags;
}

function pickSupportStyle(emotion, topicFlags) {
  if (topicFlags.selfHarm) return 'safety';
  if (topicFlags.grounding || emotion === 'anxious') return 'grounding';
  if (topicFlags.workPressure || emotion === 'stressed') return 'prioritization';
  if (emotion === 'fatigued') return 'recovery';
  if (emotion === 'happy' || topicFlags.celebration) return 'reinforcement';
  if (emotion === 'sad' || topicFlags.loneliness) return 'connection';
  return 'reflection';
}

function pickFollowUp(emotion, topicFlags) {
  if (topicFlags.workPressure) {
    return 'What is the smallest next step that would reduce pressure in the next 10 minutes?';
  }
  if (topicFlags.sleepDepletion || emotion === 'fatigued') {
    return 'What would help your body recover first: a pause, water, food, or rest?';
  }
  if (topicFlags.celebration || emotion === 'happy') {
    return 'What helped this go better today, and how can you protect that pattern tomorrow?';
  }
  if (topicFlags.loneliness || emotion === 'sad') {
    return 'Is there one person you would feel okay checking in with, even briefly?';
  }
  return 'What would feel most supportive right now: grounding, planning, or simply being heard?';
}

function applyIntensity(content, weight) {
  let multiplier = 1;
  INTENSIFIERS.forEach((word) => {
    if (content.includes(` ${word} `) || content.startsWith(`${word} `)) {
      multiplier += 0.12;
    }
  });
  SOFTENERS.forEach((phrase) => {
    if (content.includes(phrase)) {
      multiplier -= 0.08;
    }
  });
  return weight * multiplier;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
