import { Card } from '@prodlike/ui';
import { AppShell } from '@/components/AppShell';
import { PasswordForm, ProfileForm } from '@/components/SettingsForms';
import { requireMe } from '@/lib/api';

export const metadata = { title: 'Profile & Settings' };

/** Profile & Settings: every signed-in member can change their profile and password. */
export default async function SettingsPage() {
  const me = await requireMe('/settings');
  return (
    <AppShell me={me} active="/settings" crumbs="Account" title="Profile & Settings">
      <div className="grid max-w-4xl items-start gap-6 lg:grid-cols-2">
        <Card>
          <h2 id="profile-heading" className="mb-4 text-lg font-semibold">
            Profile
          </h2>
          <ProfileForm me={me} />
        </Card>
        <Card>
          <h2 id="password-heading" className="mb-4 text-lg font-semibold">
            Password
          </h2>
          <PasswordForm />
        </Card>
      </div>
    </AppShell>
  );
}
