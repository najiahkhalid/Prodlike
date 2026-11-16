import { Card } from '@prodlike/ui';
import type { AdminUser } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { RoleSelect } from '@/components/instructor/RoleSelect';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Users & roles' };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Users and roles (FR-20). */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = '' }, me] = await Promise.all([searchParams, requireMe('/admin/users')]);
  const res = await serverApi<AdminUser[]>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);

  return (
    <AppShell me={me} active="/admin/users" crumbs="Admin" title="Users & roles">
      <form className="mb-5 flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search users
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name or email"
          className="field-input"
        />
        <button type="submit" className="rounded-sm bg-primary px-4 text-sm font-semibold text-white">
          Search
        </button>
      </form>
      <Card className="p-0">
        {!res.ok ? (
          <p role="alert" className="p-5 text-bad-text">
            {res.error.message}
          </p>
        ) : res.data.length === 0 ? (
          <p className="p-5 text-ink-muted">No users match.</p>
        ) : (
          <table className="w-full text-sm" aria-label="Users">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                <th className="px-5 py-2.5">User</th>
                <th className="px-3 py-2.5">Organisation</th>
                <th className="px-3 py-2.5">Joined</th>
                <th className="px-3 py-2.5">Completed</th>
                <th className="px-5 py-2.5">Role</th>
              </tr>
            </thead>
            <tbody>
              {res.data.map((u) => (
                <tr key={u.id} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{u.name}</div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-muted">{u.organisation ?? '—'}</td>
                  <td className="px-3 py-3 text-ink-muted">{day(u.createdAt)}</td>
                  <td className="px-3 py-3 font-mono">{u.completedAttempts}</td>
                  <td className="px-5 py-3">
                    <RoleSelect userId={u.id} role={u.role} name={u.name} self={u.id === me.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
