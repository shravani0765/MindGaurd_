import React, { useId } from 'react';
import { getLanguage, tierForLevel, WARMTH_TIERS } from '../services/vernacular';

/**
 * The 0–100 familiarity slider.
 *
 * It shows a live sample of the currently selected language at the current
 * tier, because "45%" means nothing to a user — hearing the actual sentence does.
 */
export default function WarmthSlider({ value, onChange, languageId }) {
  const id = useId();
  const tier = tierForLevel(value);
  const language = getLanguage(languageId);
  const bank = language.phrases[tier];
  const sample = bank ? `${bank.acknowledge[0]} ${bank.reassure[0]}` : '';

  return (
    <div className="warmth-slider">
      <div className="warmth-slider__head">
        <label htmlFor={id}>Conversational warmth</label>
        <span className={`warmth-slider__tier warmth-slider__tier--${tier}`}>
          {WARMTH_TIERS[tier].label} · {value}%
        </span>
      </div>

      <input
        id={id}
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="warmth-slider__input"
        aria-describedby={`${id}-sample`}
      />

      <div className="warmth-slider__scale" aria-hidden="true">
        <span>Formal</span>
        <span>Friendly</span>
        <span>Home comfort</span>
      </div>

      <p className="warmth-slider__sample" id={`${id}-sample`}>
        <span className="warmth-slider__sample-label">Sounds like</span>
        <span className="warmth-slider__sample-text">“{sample}”</span>
      </p>
    </div>
  );
}
