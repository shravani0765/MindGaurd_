// web/src/services/streaks.js
// Check-in streaks and weekly progress.
//
// Deliberately forgiving: this is a wellness tool, not a game. A streak that
// punishes someone for a bad day is the opposite of what the product is for,
// so a single missed day does not reset it — see GRACE_DAYS.

// One missed day is absorbed. Two in a row ends the streak.
const GRACE_DAYS = 1;
const WEEKLY_GOAL = 5;

/** Local calendar day key, so streaks follow the user's midnight, not UTC. */
function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function daysBetween(later, earlier) {
  const a = new Date(later);
  const b = new Date(earlier);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}

/**
 * @param {Array<{timestamp: string}>} moodHistory newest-first
 * @returns {{current: number, best: number, isActiveToday: boolean, atRisk: boolean, daysThisWeek: number, weeklyGoal: number}}
 */
export function calculateStreak(moodHistory = []) {
  const empty = {
    current: 0,
    best: 0,
    isActiveToday: false,
    atRisk: false,
    daysThisWeek: 0,
    weeklyGoal: WEEKLY_GOAL,
  };
  if (!moodHistory.length) return empty;

  // Collapse to unique days, newest first — several check-ins in one day is
  // still one day of the streak.
  const seen = new Set();
  const days = [];
  for (const entry of moodHistory) {
    const key = dayKey(entry.timestamp);
    if (!seen.has(key)) {
      seen.add(key);
      days.push(new Date(entry.timestamp));
    }
  }
  days.sort((a, b) => b - a);

  const today = new Date();
  const gapFromToday = daysBetween(today, days[0]);

  // Already broken: nothing logged within the grace window.
  if (gapFromToday > GRACE_DAYS + 1) {
    return { ...empty, best: longestRun(days), daysThisWeek: countThisWeek(days) };
  }

  let current = 1;
  for (let index = 1; index < days.length; index += 1) {
    const gap = daysBetween(days[index - 1], days[index]);
    if (gap <= GRACE_DAYS + 1) current += 1;
    else break;
  }

  return {
    current,
    best: Math.max(current, longestRun(days)),
    isActiveToday: gapFromToday === 0,
    // Any day without a check-in puts the streak at risk. Only a gap of 0
    // (already logged today) is safe.
    atRisk: gapFromToday >= 1,
    daysThisWeek: countThisWeek(days),
    weeklyGoal: WEEKLY_GOAL,
  };
}

function longestRun(days) {
  if (!days.length) return 0;
  let best = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (daysBetween(days[index - 1], days[index]) <= GRACE_DAYS + 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function countThisWeek(days) {
  const today = new Date();
  return days.filter((day) => daysBetween(today, day) < 7).length;
}

/**
 * Encouragement for the current state. Never scolds: a lapsed streak gets an
 * invitation, not a guilt trip.
 */
export function streakMessage(streak) {
  if (!streak.current) return 'Your first check-in starts a streak.';
  if (streak.atRisk) return 'Check in today to keep your streak going.';
  if (streak.current === 1) return 'Day one. Nice start.';
  if (streak.current >= 7) return `${streak.current} days. That is a real habit now.`;
  return `${streak.current} days in a row.`;
}
