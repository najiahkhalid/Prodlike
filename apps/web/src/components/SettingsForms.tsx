'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import { ChangePasswordSchema, UpdateProfileSchema, type Me } from '@prodlike/shared';
import { Field, FormError } from '@/components/auth/Field';
import { ClientApiError, clientApi } from '@/lib/client-api';

type Errors = Record<string, string>;

function issuesToFields(issues: { path: (string | number)[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
}

/** Profile: name and organisation. */
export function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const [fields, setFields] = useState<Errors>({});
  const [error, setError] = useState<{ message: string; action?: string }>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = UpdateProfileSchema.safeParse({
      name: String(f.get('name') ?? ''),
      organisation: String(f.get('organisation') ?? ''),
    });
    setSaved(false);
    if (!parsed.success) {
      setFields(issuesToFields(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await clientApi<Me>('/auth/me', { method: 'PATCH', body: JSON.stringify(parsed.data) });
      setFields({});
      setError(undefined);
      setSaved(true);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.body.fields ?? {});
        setError({ message: err.body.message, action: err.body.action });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="profile-heading">
      <FormError {...error} />
      <Field id="name" label="Full name" defaultValue={me.name} autoComplete="name" error={fields.name} />
      <Field
        id="organisation"
        label={
          <>
            University / organisation <span className="font-normal text-ink-muted">(optional)</span>
          </>
        }
        defaultValue={me.organisation ?? ''}
        autoComplete="organization"
        error={fields.organisation}
      />
      <div className="mb-4">
        <span className="field-label">Email</span>
        <p className="text-sm text-ink-muted">{me.email}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          Save profile
        </Button>
        {saved && (
          <span role="status" className="text-sm font-semibold text-ok-text">
            ✓ Profile saved
          </span>
        )}
      </div>
    </form>
  );
}

/** Change password: needs the current one; signs out other devices. */
export function PasswordForm() {
  const [fields, setFields] = useState<Errors>({});
  const [error, setError] = useState<{ message: string; action?: string }>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: String(f.get('currentPassword') ?? ''),
      newPassword: String(f.get('newPassword') ?? ''),
    });
    setDone(false);
    if (!parsed.success) {
      const errs = issuesToFields(parsed.error.issues);
      setFields(errs);
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }
    setBusy(true);
    try {
      await clientApi<Me>('/auth/change-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      form.reset();
      setFields({});
      setError(undefined);
      setDone(true);
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.body.fields ?? {});
        setError({ message: err.body.message, action: err.body.action });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="password-heading">
      <FormError {...error} />
      <Field
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        error={fields.currentPassword}
      />
      <Field
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={fields.newPassword}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          Change password
        </Button>
        {done && (
          <span role="status" className="text-sm font-semibold text-ok-text">
            ✓ Password changed. Other devices were signed out.
          </span>
        )}
      </div>
    </form>
  );
}
