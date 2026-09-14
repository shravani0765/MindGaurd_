import React from 'react';

/** Compact status pill. `tone` maps to the shared semantic colour set. */
export default function Badge({ tone = 'neutral', icon: Icon, children, className = '' }) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`.trim()}>
      {Icon && <Icon size={11} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
