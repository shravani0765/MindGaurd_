import React from 'react';
import { Flame, Target } from 'lucide-react';
import { calculateStreak, streakMessage } from '../services/streaks';

/** Streak plus a weekly progress ring. */
export default function StreakCard({ moodHistory = [] }) {
  const streak = calculateStreak(moodHistory);
  const progress = Math.min(streak.daysThisWeek / streak.weeklyGoal, 1);
  const circumference = 2 * Math.PI * 26;

  return (
    <div className={`streak-card ${streak.isActiveToday ? 'is-active' : ''}`.trim()}>
      <div className="streak-card__flame">
        <Flame size={22} aria-hidden="true" />
        <strong>{streak.current}</strong>
        <span>day{streak.current === 1 ? '' : 's'}</span>
      </div>

      <div className="streak-card__copy">
        <p className="streak-card__message">{streakMessage(streak)}</p>
        <p className="streak-card__best">
          <Target size={12} aria-hidden="true" />
          Best streak: {streak.best} day{streak.best === 1 ? '' : 's'}
        </p>
      </div>

      <div
        className="streak-card__ring"
        role="img"
        aria-label={`${streak.daysThisWeek} of ${streak.weeklyGoal} days checked in this week`}
      >
        <svg viewBox="0 0 60 60" width="60" height="60">
          <circle cx="30" cy="30" r="26" className="streak-card__ring-track" />
          <circle
            cx="30" cy="30" r="26"
            className="streak-card__ring-fill"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
          />
        </svg>
        <span className="streak-card__ring-label">
          {streak.daysThisWeek}<small>/{streak.weeklyGoal}</small>
        </span>
      </div>
    </div>
  );
}
