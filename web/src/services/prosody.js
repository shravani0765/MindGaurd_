// web/src/services/prosody.js
// Duolingo-style prosody conditioning: breath pacing, pitch-contour smoothing,
// and phonetic normalisation so a synthesised reply never sounds clipped or robotic.

// Words/tokens that a TTS front-end routinely mispronounces in a wellness context.
const PHONETIC_SMOOTHING = [
  [/\bAUM\b/gi, 'Ohm'],
  [/\bOM\b/g, 'Ohm'],
  [/\bpranayama\b/gi, 'prah-nah-yah-ma'],
  [/\bnamaste\b/gi, 'nuh-mus-tay'],
  [/\bsadhguru\b/gi, 'Sahd-guru'],
  [/\bMindGuard\b/g, 'Mind Guard'],
  [/\bCBT\b/g, 'C B T'],
  [/\bHRV\b/g, 'H R V'],
  [/\b432Hz\b/gi, 'four thirty two hertz'],
  [/\b528Hz\b/gi, 'five twenty eight hertz'],
  [/(\d+)\s*Hz\b/gi, '$1 hertz'],
  [/(\d+)\s*%/g, '$1 percent'],
  [/\bw\/\b/gi, 'with'],
  [/&/g, ' and '],
];

// Markdown links: keep the label, drop the URL so it is never read aloud.
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g;

// Remaining formatting residue that should never be voiced.
const MARKDOWN_NOISE = /[*_`~#>|[\]()<>{}]/g;

// A short breath is inserted after these connectives so long sentences do not
// run together into one flat, breathless contour.
const BREATH_CONNECTIVES =
  /\b(and then|but also|because|so that|which means|even though|instead of|rather than|as well as)\b/gi;

const ELLIPSIS_PAUSE = ', ... ';

/**
 * Base cadence for a grounded, in-the-room delivery rather than an announcer read.
 * Slightly under 1.0 rate keeps consonants intact; a touch over 1.0 pitch keeps
 * the voice from sinking into a monotone at the end of each clause.
 */
export const GROUNDED_CADENCE = Object.freeze({
  rate: 0.93,
  pitch: 1.02,
  volume: 0.95,
});

/**
 * Emotion-aware cadence offsets. A distressed user needs a slower, lower delivery;
 * a celebratory moment can carry slightly more lift without sounding manic.
 */
const EMOTION_CADENCE = {
  stressed: { rate: -0.05, pitch: -0.02 },
  anxious: { rate: -0.06, pitch: -0.03 },
  sad: { rate: -0.04, pitch: -0.02 },
  fatigued: { rate: -0.03, pitch: -0.01 },
  neutral: { rate: 0, pitch: 0 },
  calm: { rate: -0.01, pitch: 0 },
  happy: { rate: 0.03, pitch: 0.02 },
};

/**
 * Dialect-level cadence. Indian English carries a slightly faster syllable rate,
 * British English a marginally flatter contour. These are nudges, not caricature.
 */
const DIALECT_CADENCE = {
  'en-US': { rate: 0, pitch: 0 },
  'en-GB': { rate: -0.01, pitch: -0.01 },
  'en-IN': { rate: 0.02, pitch: 0.01 },
};

/**
 * Strips formatting, normalises pronunciation, and shapes breath pauses.
 * Returns plain text that both Kokoro and the Web Speech fallback can read.
 */
export function conditionForSpeech(text) {
  if (!text || !text.trim()) return '';

  let output = String(text);

  for (const [pattern, replacement] of PHONETIC_SMOOTHING) {
    output = output.replace(pattern, replacement);
  }

  output = output
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_NOISE, ' ')
    // Collapse author-written suspension dots into a single, reliably-voiced pause.
    .replace(/\.{2,}/g, ELLIPSIS_PAUSE)
    .replace(/…/g, ELLIPSIS_PAUSE)
    // Em/en dashes read as abrupt stops; a comma keeps the contour connected.
    .replace(/\s*[–—-]{1,2}\s*/g, ', ')
    // Give the listener a breath before a connective instead of after it.
    .replace(BREATH_CONNECTIVES, ', $1')
    .replace(/\s+/g, ' ')
    // Tidy stray space before punctuation, but leave the ellipsis pause intact.
    .replace(/\s+([,!?;:])/g, '$1')
    .replace(/\s+\.(?!\s*\.)/g, '.')
    .replace(/,\s*,+/g, ',')
    .trim();

  // A trailing terminator prevents the synthesiser cutting the final syllable short.
  if (output && !/[.!?]$/.test(output)) {
    output += '.';
  }

  return output;
}

/**
 * Resolves the final rate/pitch/volume for an utterance.
 */
export function resolveCadence({ emotion = 'neutral', dialect = 'en-US', urgency = 'normal' } = {}) {
  const emotionOffset = EMOTION_CADENCE[emotion] || EMOTION_CADENCE.neutral;
  const dialectOffset = DIALECT_CADENCE[dialect] || DIALECT_CADENCE['en-US'];
  // A safety-critical reply is delivered slowest so it stays comprehensible.
  const urgencyOffset = urgency === 'high' ? -0.07 : urgency === 'elevated' ? -0.03 : 0;

  return {
    rate: clamp(GROUNDED_CADENCE.rate + emotionOffset.rate + dialectOffset.rate + urgencyOffset, 0.7, 1.15),
    pitch: clamp(GROUNDED_CADENCE.pitch + emotionOffset.pitch + dialectOffset.pitch, 0.8, 1.2),
    volume: GROUNDED_CADENCE.volume,
  };
}

/**
 * Splits conditioned text into clause-sized chunks for streaming synthesis.
 * Chunking at clause boundaries (rather than a fixed character count) is what
 * stops the voice breaking mid-word between generated segments.
 */
export function splitIntoBreathGroups(text, maxChars = 180) {
  const conditioned = conditionForSpeech(text);
  if (!conditioned) return [];

  const sentences = conditioned.match(/[^.!?]+[.!?]+|\S+$/g) || [conditioned];
  const groups = [];
  let buffer = '';

  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence.trim()}` : sentence.trim();
    if (candidate.length > maxChars && buffer) {
      groups.push(buffer);
      buffer = sentence.trim();
    } else {
      buffer = candidate;
    }
  }

  if (buffer) groups.push(buffer);
  return groups.filter(Boolean);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
