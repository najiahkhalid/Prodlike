import type { InputHTMLAttributes } from 'react';

/** Labelled input with an accessible error message (NFR-07, NFR-09). */
export function Field({
  id,
  label,
  error,
  hint,
  ...input
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="mb-4">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="field-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level error banner: what happened + what to do next. */
export function FormError({ message, action }: { message?: string; action?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-sm border border-bad/30 bg-bad-tint px-3 py-2.5 text-sm text-bad-text"
    >
      <b>{message}</b> {action}
    </div>
  );
}
