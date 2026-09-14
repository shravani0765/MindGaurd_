import React from 'react';

/**
 * A bordered note.
 *
 * tone: 'info'   — green left rule, for supporting guidance
 *       'danger' — red outline, for the crisis disclaimer
 *       'muted'  — neutral, for incidental detail
 */
export default function Callout({ tone = 'info', title, icon: Icon, children, className = '' }) {
  return (
    <div className={`ui-callout ui-callout--${tone} ${className}`.trim()} role={tone === 'danger' ? 'note' : undefined}>
      {title && (
        <p className="ui-callout__title">
          {Icon && <Icon size={16} aria-hidden="true" />}
          <span>{title}</span>
        </p>
      )}
      {children && <div className="ui-callout__body">{children}</div>}
    </div>
  );
}
