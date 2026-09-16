import React from 'react';

/**
 * The MindGuard mark: a lotus held inside a shield.
 *
 * The shield carries the "Guard" half of the name — protection of something
 * private. The lotus is the wellbeing half, and is deliberately an Indian
 * symbol rather than the generic brain or heart glyph these apps default to,
 * because the product's whole premise is cultural grounding. The open ring
 * behind it reads as a breath cycle, which is the one action the app asks for
 * most often.
 *
 * Drawn with currentColor so it inherits from whatever it sits on, including
 * the amber night theme.
 */
export default function BrandMark({ size = 22, title = 'MindGuard' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* shield — the "Guard" half of the name */}
      <path
        d="M16 2.8 26.6 7.3v8.4c0 6.5-10.6 12-10.6 12S5.4 22.2 5.4 15.7V7.3L16 2.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* lotus — sized to fill the shield so it still reads at 22px */}
      <path
        d="M16 7.4c2.75 3.85 2.75 8.9 0 13-2.75-4.1-2.75-9.15 0-13Z"
        fill="currentColor"
      />
      <path
        d="M16 20.9c-4.3-1-7.5-4.35-8.1-8.35 4.1.85 7.15 4.2 8.1 8.35Z"
        fill="currentColor"
        opacity="0.66"
      />
      <path
        d="M16 20.9c4.3-1 7.5-4.35 8.1-8.35-4.1.85-7.15 4.2-8.1 8.35Z"
        fill="currentColor"
        opacity="0.66"
      />
    </svg>
  );
}
