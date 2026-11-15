'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import { ForgotPasswordSchema, ResetPasswordSchema } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';
import { Field, FormError } from './Field';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; action?: string }>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = ForgotPasswordSchema.safeParse({ email: new FormData(e.currentTarget).get('email') });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(undefined);
    try {
      await clientApi('/auth/forgot-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      setSent(true);
    } catch (err) {
      if (err instanceof ClientApiError) setFormError({ message: err.body.message, action: err.body.action });
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-sm bg-ok-tint p-4 text-ok-text">
        <b>Check your email.</b> If an account exists for that address, a reset link is on its way. It is
        valid for 30 minutes.
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <FormError {...formError} />
      <Field id="email" label="Email" type="email" autoComplete="email" error={error} />
      <Button type="submit" size="lg" className="w-full">
        Send reset link
      </Button>
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; action?: string }>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = ResetPasswordSchema.safeParse({
      token,
      password: new FormData(e.currentTarget).get('password'),
    });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(undefined);
    try {
      await clientApi('/auth/reset-password', { method: 'POST', body: JSON.stringify(parsed.data) });
      router.push('/login?reset=1');
    } catch (err) {
      if (err instanceof ClientApiError) setFormError({ message: err.body.message, action: err.body.action });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormError {...formError} />
      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={error}
      />
      <Button type="submit" size="lg" className="w-full">
        Set new password
      </Button>
    </form>
  );
}
