'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@prodlike/ui';
import type { CohortView } from '@prodlike/shared';
import { Field, FormError } from '@/components/auth/Field';
import { ClientApiError, clientApi } from '@/lib/client-api';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal (NFR-07): focus moves into the dialog, Tab stays inside it, Escape closes it,
 * and focus returns to whatever opened it.
 */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [opener] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(() => {
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) box.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [opener]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-secondary/55 p-4" onKeyDown={onKeyDown}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg bg-white p-7 shadow-2xl"
      >
        <h2 className="text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const errorOf = (e: unknown) =>
  e instanceof ClientApiError
    ? { message: e.body.message, action: e.body.action }
    : { message: 'Something went wrong.' };

/** "+ New class" (FR-17). */
export function NewCohortButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; action?: string }>();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('cohort-name') ?? '');
    try {
      const c = await clientApi<CohortView>('/instructor/cohorts', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setOpen(false);
      router.push(`/instructor?cohort=${c.id}`);
      router.refresh();
    } catch (err) {
      setError(errorOf(err));
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + New class
      </Button>
      {open && (
        <Modal title="Create a class" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="mt-4" noValidate>
            <FormError {...error} />
            <Field id="cohort-name" label="Class name" placeholder="e.g. BSCS-12 Lab" autoFocus />
            <p className="-mt-2 mb-4 text-xs text-ink-muted">
              Learners join with a code you share. You only ever see data for your own classes.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** "Assign scenario" with an optional deadline (FR-17). */
export function AssignButton({
  cohortId,
  scenarios,
}: {
  cohortId: string;
  scenarios: { slug: string; title: string; draft: boolean }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; action?: string }>();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const due = String(f.get('due') ?? '');
    try {
      await clientApi(`/instructor/cohorts/${cohortId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          scenario: f.get('scenario'),
          ...(due ? { dueAt: new Date(due).toISOString() } : {}),
          randomiseFaults: f.get('randomise') === 'on',
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorOf(err));
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Assign scenario</Button>
      {open && (
        <Modal title="Assign a scenario" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="mt-4" noValidate>
            <FormError {...error} />
            <label htmlFor="scenario" className="field-label">
              Scenario
            </label>
            <select id="scenario" name="scenario" className="field-input mb-4">
              {scenarios.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                  {s.draft ? ' (your variant)' : ''}
                </option>
              ))}
            </select>
            <Field
              id="due"
              label={
                <>
                  Deadline <span className="font-normal text-ink-muted">(optional)</span>
                </>
              }
              type="datetime-local"
            />
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" name="randomise" defaultChecked /> Randomise injected faults per learner
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Assign</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Small action button that calls the API, then refreshes the page (remove learner, archive, …). */
export function ActionButton({
  path,
  method = 'DELETE',
  label,
  confirmText,
  body,
  redirectTo,
}: {
  path: string;
  method?: 'DELETE' | 'PATCH' | 'POST';
  label: string;
  confirmText?: string;
  body?: unknown;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  return (
    <span>
      <button
        type="button"
        className="text-sm font-semibold text-bad-text hover:underline"
        onClick={async () => {
          if (confirmText && !confirm(confirmText)) return;
          try {
            await clientApi(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          } catch (e) {
            setError(errorOf(e).message);
          }
        }}
      >
        {label}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-xs text-bad-text">
          {error}
        </span>
      )}
    </span>
  );
}

/** Copy-to-clipboard for the join code. */
export function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked: the code is visible anyway
        }
      }}
      className="rounded-sm bg-primary-tint px-3 py-2 font-mono text-lg font-bold tracking-widest text-ink"
      title="Copy join code"
      data-testid="join-code"
    >
      {code}
      <span className="ml-2 text-xs font-semibold text-primary">{copied ? '✓ copied' : 'copy'}</span>
    </button>
  );
}
