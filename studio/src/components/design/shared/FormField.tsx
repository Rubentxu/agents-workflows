/**
 * FormField — Wraps a form input with a label, optional description, and error state.
 * Used by all resource editors to provide consistent field presentation.
 */

import { type ReactNode } from 'react';

export interface FormFieldProps {
  /** Field label displayed above the input */
  label: string;
  /** Additional helper text displayed below the label */
  description?: string;
  /** Error message; when set the field is considered to have an error */
  error?: string;
  /** Marks the field as required with a visual indicator */
  required?: boolean;
  /** The form control to render (input, textarea, select, etc.) */
  children: ReactNode;
  /** Additional CSS classes for the wrapper element */
  className?: string;
}

/**
 * Renders a labelled form field with optional description and error styling.
 * The `children` slot should contain the actual input element.
 */
export function FormField({
  label,
  description,
  error,
  required = false,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Label row */}
      <label className="text-xs font-medium text-on-surface">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>

      {/* Description */}
      {description && (
        <p className="text-xs text-secondary">{description}</p>
      )}

      {/* Input */}
      {children}

      {/* Error message */}
      {error && (
        <p className="text-xs text-error">{error}</p>
      )}
    </div>
  );
}
