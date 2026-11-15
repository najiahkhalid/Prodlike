import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/PasswordForms';

export const metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell>
      <h1 className="text-3xl font-bold">Set a new password</h1>
      {token ? (
        <>
          <p className="mb-6 mt-1 text-ink-muted">Choose a new password for your account.</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p role="alert" className="mt-4 rounded-sm bg-bad-tint p-4 text-bad-text">
          <b>This reset link is incomplete.</b> Open the link from your email again, or{' '}
          <Link href="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
