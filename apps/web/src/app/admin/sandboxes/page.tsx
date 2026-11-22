import { Badge, Card } from '@prodlike/ui';
import type { SandboxHealth } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Sandbox health' };

const secs = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

/** Sandbox health (FR-20): Docker, images, warm pools, capacity and provisioning times. */
export default async function SandboxHealthPage() {
  const me = await requireMe('/admin/sandboxes');
  const res = await serverApi<SandboxHealth>('/admin/sandboxes');

  if (!res.ok) {
    return (
      <AppShell me={me} active="/admin/sandboxes" crumbs="Admin" title="Sandbox health">
        <p role="alert" className="text-bad-text">
          {res.error.message} {res.error.action}
        </p>
      </AppShell>
    );
  }
  const h = res.data;
  const used = h.maxActive ? Math.round((h.activeSandboxes / h.maxActive) * 100) : 0;
  const states = Object.entries(h.attemptsByState).filter(([, n]) => (n ?? 0) > 0);

  return (
    <AppShell me={me} active="/admin/sandboxes" crumbs="Admin" title="Sandbox health">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Docker</div>
          <div className="mt-2" data-testid="docker-status">
            {h.docker ? <Badge tone="ok">✓ Reachable</Badge> : <Badge tone="bad">✕ Not reachable</Badge>}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Active sandboxes</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">
            {h.activeSandboxes} <span className="text-lg font-semibold text-ink-muted">/ {h.maxActive}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100" aria-hidden>
            <div
              className={`h-1.5 rounded-full ${used >= 90 ? 'bg-bad' : used >= 70 ? 'bg-warn' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, used)}%` }}
            />
          </div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Average start (24h)</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">{secs(h.provisioning.averageMs)}</div>
          <div className="text-[13px] text-ink-muted">
            {h.provisioning.last24h} started · slowest {secs(h.provisioning.slowestMs)}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Warm containers</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">
            {Object.values(h.warmPool).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-[13px] text-ink-muted">Ready for instant starts</div>
        </Card>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="px-5 pb-2 pt-5 text-lg font-semibold">Scenario images</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Scenario images">
              <thead>
                <tr className="border-y border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-2.5">Scenario</th>
                  <th className="px-3 py-2.5">Image</th>
                  <th className="px-5 py-2.5">Warm pool</th>
                </tr>
              </thead>
              <tbody>
                {h.images.map((i) => (
                  <tr key={i.slug} className="border-b border-surface-border last:border-0">
                    <td className="px-5 py-3 font-mono">{i.slug}</td>
                    <td className="px-3 py-3">
                      {i.built ? (
                        <Badge tone="ok">✓ Built</Badge>
                      ) : (
                        <Badge tone="warn">Missing: run pnpm scenarios:build</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono">{h.warmPool[i.slug] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Attempts by state</h2>
          {states.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No attempts are in progress.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {states.map(([s, n]) => (
                <li
                  key={s}
                  className="flex justify-between border-b border-surface-border pb-2 last:border-0"
                >
                  <span className="font-mono text-ink-muted">{s}</span>
                  <b className="font-mono">{n}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
