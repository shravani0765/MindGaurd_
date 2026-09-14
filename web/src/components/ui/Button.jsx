import React from 'react';

/**
 * The single button in the design system.
 *
 * variant: 'primary' | 'ghost' | 'link' | 'danger'
 * size:    'sm' | 'md' | 'lg'
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  isLoading = false,
  loadingLabel,
  icon: Icon,
  iconSize,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    block ? 'ui-button--block' : '',
    isLoading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} disabled={disabled || isLoading} {...rest}>
      {Icon && !isLoading && <Icon size={iconSize ?? (size === 'sm' ? 13 : 16)} aria-hidden="true" />}
      {isLoading && <span className="ui-button__spinner" aria-hidden="true" />}
      <span>{isLoading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}
