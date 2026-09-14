import React from 'react';

/**
 * Inline form feedback. Errors use role="alert" so they interrupt a screen
 * reader; successes use the polite live region so they do not.
 */
export default function StatusBanner({ tone = 'info', children, className = '' }) {
  if (!children) return null;

  return (
    <div
      className={`ui-status ui-status--${tone} ${className}`.trim()}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  );
}
