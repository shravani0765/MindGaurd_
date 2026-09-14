import React from 'react';

/** A surface with an optional header. `as` lets callers pick the landmark tag. */
export default function Panel({
  eyebrow,
  title,
  description,
  actions,
  padded = true,
  children,
  className = '',
  as: Component = 'section',
}) {
  const hasHeader = eyebrow || title || description || actions;

  return (
    <Component className={`ui-panel ${padded ? 'ui-panel--padded' : ''} ${className}`.trim()}>
      {hasHeader && (
        <header className="ui-panel__header">
          <div className="ui-panel__heading">
            {eyebrow && <span className="ui-panel__eyebrow">{eyebrow}</span>}
            {title && <h3 className="ui-panel__title">{title}</h3>}
            {description && <p className="ui-panel__description">{description}</p>}
          </div>
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </Component>
  );
}
