import React, { useEffect, useState } from 'react';
import BrandMark from './BrandMark';
import { quoteForToday } from '../services/dailyQuotes';

/**
 * One grounding line per day, under the streak card.
 *
 * The quote is derived from the calendar date rather than picked at random, so
 * it stays the same all day and turns over at local midnight. A user who opens
 * the app three times in an afternoon should meet the same line each time — a
 * line that reshuffles on every render reads as decoration rather than as a
 * thought worth sitting with.
 *
 * The motion is deliberately slow. This sits in a wellbeing dashboard, so it
 * should draw the eye and then settle, not compete with the check-in controls.
 */
export default function DailyQuote() {
  const [quote, setQuote] = useState(quoteForToday);

  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setQuote(quoteForToday()), midnight - now + 1000);
    return () => clearTimeout(timer);
  }, []);

  const words = quote.text.split(' ');

  return (
    <figure className="daily-quote" key={quote.text}>
      {/* Slow-drifting orbs; purely decorative, hidden from assistive tech. */}
      <span className="daily-quote__orb daily-quote__orb--a" aria-hidden="true" />
      <span className="daily-quote__orb daily-quote__orb--b" aria-hidden="true" />

      {/* The brand lotus as a watermark, tying the card to the product mark. */}
      <span className="daily-quote__watermark" aria-hidden="true">
        <BrandMark size={104} title="" />
      </span>

      <span className="daily-quote__eyebrow">Thought for today</span>

      <blockquote className="daily-quote__text">
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="daily-quote__word"
            style={{ animationDelay: `${180 + index * 55}ms` }}
          >
            {word}
          </span>
        ))}
      </blockquote>

      <figcaption className="daily-quote__source">
        <span className="daily-quote__rule" aria-hidden="true" />
        {quote.source}
      </figcaption>
    </figure>
  );
}
