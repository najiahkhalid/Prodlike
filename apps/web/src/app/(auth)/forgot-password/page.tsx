import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';

export const metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <h1 className="text-3xl font-bold">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-ink-muted">
        Enter your email and we will send you a link to set a new one.
      </p>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
