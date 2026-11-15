'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import { LoginSchema, RegisterSchema, homeFor, type Me } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';
import { Field, FormError } from './Field';

type Mode = 'login' | 'signup';
type Role = 'LEARNER' | 'INSTRUCTOR';

function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role>(params.get('role') === 'instructor' ? 'INSTRUCTOR' : 'LEARNER');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; action?: string }>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = mode === 'signup' ? { ...data, role } : data;

    // Same zod schema as the API: instant feedback, and the API checks again anyway.
    const parsed = (mode === 'signup' ? RegisterSchema : LoginSchema).safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setFields(errs);
      setFormError(undefined);
      document.getElementById(Object.keys(errs)[0])?.focus();
      return;
    }

    setBusy(true);
    setFields({});
    setFormError(undefined);
    try {
      const me = await clientApi<Me>(mode === 'signup' ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      router.push(safeNext(params.get('next')) ?? homeFor(me.role));
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setFields(err.body.fields ?? {});
        setFormError({ message: err.body.message, action: err.body.action });
      }
      setBusy(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <>
      <h1 className="text-3xl font-bold">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mb-6 mt-1 text-ink-muted">
        {signup ? 'Free for students. Takes under a minute.' : 'Log in to continue your scenarios.'}
      </p>

      {params.get('loggedOut') && !formError && (
        <p role="status" className="mb-4 rounded-sm bg-ok-tint px-3 py-2.5 text-sm text-ok-text">
          You have been logged out.
        </p>
      )}
      {params.get('reset') && !formError && (
        <p role="status" className="mb-4 rounded-sm bg-ok-tint px-3 py-2.5 text-sm text-ok-text">
          Password updated. Log in with your new password.
        </p>
      )}
      <FormError {...formError} />

      <form onSubmit={onSubmit} noValidate>
        {signup && (
          <fieldset className="mb-4">
            <legend className="field-label">I am a…</legend>
            <div className="grid grid-cols-2 gap-1 rounded-sm bg-slate-100 p-1" role="radiogroup">
              {(['LEARNER', 'INSTRUCTOR'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => setRole(r)}
                  className={`rounded-[5px] py-2 text-sm font-semibold ${
                    role === r ? 'bg-white text-ink shadow-card' : 'text-ink-muted'
                  }`}
                >
                  {r === 'LEARNER' ? 'Learner' : 'Instructor'}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {signup && <Field id="name" label="Full name" autoComplete="name" error={fields.name} />}
        <Field id="email" label="Email" type="email" autoComplete="email" error={fields.email} />
        {signup && (
          <Field
            id="organisation"
            label={
              <>
                University / organisation <span className="font-normal text-ink-muted">(optional)</span>
              </>
            }
            autoComplete="organization"
            error={fields.organisation}
          />
        )}
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          hint={signup ? 'At least 10 characters.' : undefined}
          error={fields.password}
        />
        {!signup && (
          <p className="-mt-2 mb-4 text-right text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot password?
            </Link>
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {signup ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New to Prodlike?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </>
  );
}
