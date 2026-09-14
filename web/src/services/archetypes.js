// web/src/services/archetypes.js
// Onboarding archetypes and regional voice registers.
//
// The archetype decides *how much* reassurance a reply leads with and what it
// asks for next; the region decides the idiom and grounding image it reaches
// for. Both only reshape wording — never the clinical content, and never the
// crisis path, which stays identical for every user.

export const ARCHETYPES = Object.freeze({
  worrier: {
    id: 'worrier',
    label: 'High-functioning worrier',
    glyph: '🌀',
    summary: 'You keep delivering, but the background hum of "what if" never switches off.',
    // Prepended to a reply so the user is met before they are advised.
    opener: 'You are holding a lot together, and it is still landing well.',
    // Used to close a reply — the ask that best fits how this person engages.
    invitation: 'What is the one worry we could set down for the next ten minutes?',
    // Tone instructions consumed by the LLM persona prompt.
    promptModifier:
      'Speak to someone competent and quietly anxious. Validate the effort before naming the worry, avoid reassurance that sounds dismissive, and offer exactly one concrete next step rather than a list.',
    pacing: 'steady',
  },
  gatherer: {
    id: 'gatherer',
    label: 'Piece gatherer',
    glyph: '🧩',
    summary: 'You are rebuilding after something broke, one piece at a time.',
    opener: 'Putting things back together takes longer than people admit, and you are doing it.',
    invitation: 'Which single piece feels closest to being back in place?',
    promptModifier:
      'Speak to someone rebuilding after disruption. Acknowledge progress that the user may not count as progress, keep the horizon short, and never imply they should be further along than they are.',
    pacing: 'patient',
  },
  seeker: {
    id: 'seeker',
    label: 'Disconnected seeker',
    glyph: '🧭',
    summary: 'Things look fine from the outside, but you feel at a distance from them.',
    opener: 'Feeling at arm’s length from your own life is real, even when nothing looks wrong.',
    invitation: 'What is one thing today that you felt even slightly connected to?',
    promptModifier:
      'Speak to someone experiencing numbness or detachment rather than acute distress. Favour sensory, present-tense language over analysis, and invite small reconnection instead of insight.',
    pacing: 'unhurried',
  },
  silent: {
    id: 'silent',
    label: 'Silent struggler',
    glyph: '🌘',
    summary: 'You carry it alone because saying it out loud feels like too much.',
    opener: 'You did not have to say anything here, and you did. That counts.',
    invitation: 'Would it feel easier to name one word for it, rather than a sentence?',
    promptModifier:
      'Speak to someone who rarely discloses. Keep sentences short, ask for very little, never push for detail, and make it explicit that a partial answer is enough.',
    pacing: 'gentle',
  },
});

export const DEFAULT_ARCHETYPE_ID = 'worrier';

/**
 * Regional registers. `grounding` is a locally-familiar sensory image used in
 * somatic prompts; `affirmations` are conversational fillers that read as
 * natural in that variety of English rather than translated.
 */
export const REGIONS = Object.freeze({
  'en-US': {
    id: 'en-US',
    label: 'US English',
    glyph: '🇺🇸',
    grounding: 'Feel both feet flat on the floor and let your shoulders drop an inch.',
    affirmations: ["I'm right here with you.", 'No rush at all.', "That makes sense."],
    softener: 'Take a slow, gentle breath',
  },
  'en-GB': {
    id: 'en-GB',
    label: 'UK English',
    glyph: '🇬🇧',
    grounding: 'Let your jaw unclench and let the next breath out be a little longer than the one in.',
    affirmations: ["I'm here, take your time.", 'That sounds genuinely difficult.', 'No need to tidy it up for me.'],
    softener: 'Have a slow breath',
  },
  'en-IN': {
    id: 'en-IN',
    label: 'Indian English',
    glyph: '🇮🇳',
    grounding: 'Sit back, unclench your hands, and let one long breath go out slowly.',
    affirmations: ['I am right here with you.', 'Take your own time, no hurry.', 'It is completely okay to feel this.'],
    softener: 'Take one slow, easy breath',
  },
});

export const DEFAULT_REGION_ID = 'en-US';

export function getArchetype(archetypeId) {
  return ARCHETYPES[archetypeId] || ARCHETYPES[DEFAULT_ARCHETYPE_ID];
}

export function getRegion(regionId) {
  return REGIONS[regionId] || REGIONS[DEFAULT_REGION_ID];
}

/**
 * Picks a conversational filler, rotating by `seed` so the same phrase does not
 * repeat on consecutive replies.
 */
export function pickAffirmation(regionId, seed = 0) {
  const { affirmations } = getRegion(regionId);
  return affirmations[Math.abs(Math.trunc(seed)) % affirmations.length];
}

/**
 * Wraps a base reply in the archetype's register.
 *
 * `urgency === 'high'` deliberately bypasses all of this: a crisis reply must
 * not be softened, re-paced, or padded with an archetype opener.
 */
export function applyPersonaVoice(
  baseMessage,
  { archetypeId = DEFAULT_ARCHETYPE_ID, regionId = DEFAULT_REGION_ID, urgency = 'normal', turn = 0, withOpener = true } = {}
) {
  if (urgency === 'high') return baseMessage;

  const archetype = getArchetype(archetypeId);
  const parts = [];

  if (withOpener) parts.push(archetype.opener);
  parts.push(pickAffirmation(regionId, turn));
  parts.push(baseMessage);

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The archetype-appropriate closing question, used in place of the generic one.
 */
export function personaFollowUp(archetypeId, fallbackFollowUp = '') {
  return getArchetype(archetypeId).invitation || fallbackFollowUp;
}

/**
 * Region-aware somatic instruction, so grounding advice uses a familiar image.
 */
export function regionalGrounding(regionId) {
  return getRegion(regionId).grounding;
}

/**
 * Assembles the persona prompt fragment sent to a server-side LLM.
 */
export function buildPersonaPrompt({ archetypeId = DEFAULT_ARCHETYPE_ID, regionId = DEFAULT_REGION_ID } = {}) {
  const archetype = getArchetype(archetypeId);
  const region = getRegion(regionId);

  return [
    `User archetype: ${archetype.label}. ${archetype.summary}`,
    `Tone: ${archetype.promptModifier}`,
    `Write in ${region.label}, using idiom that sounds native to that variety rather than translated.`,
    `Pace the reply as "${archetype.pacing}" and use "..." to mark a genuine pause, not for emphasis.`,
    'Never soften or re-pace a safety message. Crisis guidance is delivered plainly and identically for every user.',
  ].join(' ');
}
