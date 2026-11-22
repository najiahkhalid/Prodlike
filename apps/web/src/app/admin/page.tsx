import { Badge, Card } from '@prodlike/ui';
import type { CatalogueResponse } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { PublishToggle } from '@/components/PublishToggle';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Admin' };

/** FR-20: publish / unpublish scenarios (users & roles and sandbox health have their own pages). */
export default async function AdminPage() {
  const me = await requireMe('/admin');
  const res = await serverApi<CatalogueResponse>('/scenarios'); // admins also receive drafts

  return (
    <AppShell me={me} active="/admin" crumbs="Admin" title="Publish scenarios">
      <Card>
        <p className="mb-4 text-sm text-ink-muted">
          Scenarios are loaded from the <code className="font-mono">scenarios/</code> folder when the API
          starts. Only published scenarios appear in the learner catalogue.
        </p>
        {!res.ok ? (
          <p role="alert" className="text-bad-text">
            {res.error.message}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2.5 pr-3">Scenario</th>
                  <th className="py-2.5 pr-3">Difficulty</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5">Action</th>
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((s) => (
                  <tr key={s.slug} className="border-b border-surface-border">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-ink">{s.title}</div>
                      <div className="font-mono text-xs text-ink-muted">{s.slug}</div>
                    </td>
                    <td className="py-3 pr-3 capitalize">{s.difficulty}</td>
                    <td className="py-3 pr-3">
                      {s.published ? <Badge tone="ok">✓ Published</Badge> : <Badge>Draft</Badge>}
                    </td>
                    <td className="py-3">
                      <PublishToggle slug={s.slug} published={s.published} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
