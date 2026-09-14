import React, { useId } from 'react';

/**
 * A labelled form control. Renders a real <label for> pairing so the label is
 * announced by screen readers and clicking it focuses the input.
 */
export default function Field({
  label,
  hint,
  error,
  id,
  className = '',
  as: Component = 'input',
  ...inputProps
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const describedBy = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`ui-field ${error ? 'ui-field--invalid' : ''} ${className}`.trim()}>
      <label className="ui-field__label" htmlFor={fieldId}>
        {label}
      </label>
      <Component
        id={fieldId}
        className="ui-field__control"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint && !error && (
        <p className="ui-field__hint" id={`${fieldId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field__error" id={`${fieldId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Side-by-side field layout that collapses to one column on small screens. */
export function FieldRow({ children, className = '' }) {
  return <div className={`ui-field-row ${className}`.trim()}>{children}</div>;
}

/** Checkbox with wrapping supporting copy, used for consent text. */
export function CheckboxField({ label, id, className = '', ...inputProps }) {
  const generatedId = useId();
  const fieldId = id || generatedId;

  return (
    <div className={`ui-checkbox ${className}`.trim()}>
      <input type="checkbox" id={fieldId} {...inputProps} />
      <label htmlFor={fieldId}>{label}</label>
    </div>
  );
}
