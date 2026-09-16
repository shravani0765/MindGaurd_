import React, { useEffect, useState } from 'react';
import { Quote } from 'lucide-react';
import { quoteForToday } from '../services/dailyQuotes';

/**
 * One grounding line per day, sitting under the streak card.
 *
 * The quote is chosen from the calendar date rather than at random, so it
 * stays the same all day and changes at local midnight. A user who opens the
 * app three times in an afternoon should see the same line each time —
 * a line that reshuffles on every render reads as decoration, not as a thought
 * worth sitting with.
 */
export default function DailyQuote() {
  const [quote, setQuote] = useState(quoteForToday);
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    // Animate in once on mount.
    const raf = requestAnimationFrame(() => setIsEntering(false));

    // Roll over at local midnight so a session left open overnight updates.
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => setQuote(quoteForToday()), midnight - now + 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <figure className={`daily-quote ${isEntering ? 'is-entering' : ''}`.trim()}>
      <Quote size={15} className="daily-quote__mark" aria-hidden="true" />
      <blockquote>
        {quote.text.split(' ').map((word, index) => (
          <span key={`${word}-${index}`} style={{ animationDelay: `${index * 38}ms` }}>
            {word}
          </span>
        ))}
      </blockquote>
      <figcaption>{quote.source}</figcaption>
    </figure>
  );
}
