// web/src/services/dailyQuotes.js
// One grounding line per calendar day.
//
// Tone rules these were written against, because the wrong quote is worse than
// none in a mental-health context:
//   - never instruct the reader to "just" do anything
//   - never promise that things will be fine
//   - no hustle or productivity framing
//   - permission, not pressure
// The yogic lines are included because the product's premise is cultural
// grounding, and they sit alongside the breathwork the app actually offers.

const QUOTES = [
  { text: 'Noticing how you feel is already the harder half of the work.', source: 'MindGuard' },
  { text: 'You do not have to explain it perfectly to be allowed to feel it.', source: 'MindGuard' },
  { text: 'Rest is not what you earn after the work. It is part of the work.', source: 'MindGuard' },
  { text: 'The breath is the bridge between the body and the mind.', source: 'Yogic tradition' },
  { text: 'A day you got through counts, even if it did not look like much.', source: 'MindGuard' },
  { text: 'Slow is not the opposite of progress.', source: 'MindGuard' },
  { text: 'You cannot pour from a vessel you never set down.', source: 'MindGuard' },
  { text: 'Whatever you resist tends to stay. Whatever you observe tends to soften.', source: 'Yogic tradition' },
  { text: 'One honest sentence is worth more than an hour of pretending.', source: 'MindGuard' },
  { text: 'Exhaustion is information, not weakness.', source: 'MindGuard' },
  { text: 'Let the out-breath be longer than the in-breath. The rest follows.', source: 'Pranayama practice' },
  { text: 'You are allowed to take up space on your own worst day.', source: 'MindGuard' },
  { text: 'Not every heavy feeling needs solving. Some just need company.', source: 'MindGuard' },
  { text: 'Stillness is not doing nothing. It is doing one thing completely.', source: 'Yogic tradition' },
  { text: 'Small and repeated beats large and abandoned.', source: 'MindGuard' },
  { text: 'The mind quietens when the body is given something steady to follow.', source: 'Pranayama practice' },
  { text: 'You are not behind. You are somewhere, and somewhere is a place to start.', source: 'MindGuard' },
  { text: 'Asking for help is a skill, not a surrender.', source: 'MindGuard' },
  { text: 'Unclench your jaw. Drop your shoulders. That was probably needed.', source: 'MindGuard' },
  { text: 'What you practise daily is what you become, gently and without noticing.', source: 'Yogic tradition' },
  { text: 'Some days the goal is simply to be unhurried.', source: 'MindGuard' },
  { text: 'Feeling disconnected does not mean you are doing life incorrectly.', source: 'MindGuard' },
  { text: 'The same mind that tires you can steady you. It just needs a rhythm.', source: 'Yogic tradition' },
  { text: 'You will not always feel like this, and you do not have to prove it today.', source: 'MindGuard' },
  { text: 'Put down one thing. Just one. See how the rest feels then.', source: 'MindGuard' },
  { text: 'Grief and gratitude can sit in the same afternoon.', source: 'MindGuard' },
  { text: 'A quiet day is not a wasted day.', source: 'MindGuard' },
  { text: 'Breathe in for four, hold for four, out for four. That is the whole technique.', source: 'Box breathing' },
  { text: 'Being kind to yourself is not the reward for recovering. It is how it happens.', source: 'MindGuard' },
  { text: 'Come back to the breath. It has been waiting the entire time.', source: 'Yogic tradition' },
  { text: 'You are the one noticing the thoughts. That means you are not only the thoughts.', source: 'Yogic tradition' },
];

/** Local calendar day index, so the quote turns over at the user's midnight. */
function dayIndex(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

/**
 * The quote for a given day. Deterministic: the same date always yields the
 * same line, so it is stable across reloads and across devices.
 *
 * The prime stride keeps consecutive days far apart in the list, which stops
 * three yogic lines landing in a row when the bank is reordered.
 */
export function quoteForToday(date = new Date()) {
  return QUOTES[(dayIndex(date) * 7) % QUOTES.length];
}

export function quoteCount() {
  return QUOTES.length;
}
