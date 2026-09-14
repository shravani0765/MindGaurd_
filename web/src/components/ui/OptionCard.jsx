import React from 'react';
import { Check } from 'lucide-react';

/**
 * A large selectable card used wherever the user picks one of a small set of
 * choices (archetype, region, voice). Rendered as a radio so arrow keys work.
 */
export default function OptionCard({
  name,
  value,
  checked,
  onChange,
  glyph,
  label,
  description,
  meta,
  disabled = false,
  children,
}) {
  return (
    <label className={`ui-option ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange?.(value)}
      />
      <span className="ui-option__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="ui-option__copy">
        <span className="ui-option__label">
          {label}
          {meta && <span className="ui-option__meta">{meta}</span>}
        </span>
        {description && <span className="ui-option__description">{description}</span>}
        {children}
      </span>
      <span className="ui-option__check" aria-hidden="true">
        <Check size={14} />
      </span>
    </label>
  );
}
