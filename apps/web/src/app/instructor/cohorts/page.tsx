import Link from 'next/link';
import { Card } from '@prodlike/ui';
import type { CohortView } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { ActionButton, JoinCode, NewCohortButton } from '@/components/instructor/dialogs';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Classes' };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Cohort management (FR-17): join codes, members, archive. */
export default async function CohortsPage() {
  const me = await requireMe('/instructor/cohorts');
  const res = await serverApi<CohortView[]>('/instructor/cohorts');

  return (
    <AppShell
      me={me}
      active="/instructor/cohorts"
      crumbs="Instructor"
      title="Classes"
      actions={<NewCohortButton />}
    >
      {!res.ok ? (
        <p role="alert" className="text-bad-text">
          {res.error.message}
        </p>
      ) : res.data.length === 0 ? (
        <Card className="max-w-xl">
          <p className="text-ink-muted">No classes yet. Create one to get a join code for your learners.</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          {res.data.map((c) => (
            <Card key={c.id} className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5">
                <div>
                  <h2 className="text-lg font-semibold">
                    <Link href={`/instructor?cohort=${c.id}`} className="hover:text-primary">
                      {c.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Created {day(c.createdAt)} · {c.learners.length} learner
                    {c.learners.length === 1 ? '' : 's'} · {c.assignments.length} assignment
                    {c.assignments.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <JoinCode code={c.joinCode} />
                  <ActionButton
                    path={`/instructor/cohorts/${c.id}`}
                    label="Archive"
                    confirmText={`Archive ${c.name}? Learners can no longer join it and it leaves your dashboard. Results are kept.`}
                  />
                </div>
              </div>
              {c.learners.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-muted">
                  Nobody has joined yet. Learners enter the code on their dashboard or at sign-up.
                </p>
              ) : (
                <table className="mt-3 w-full text-sm" aria-label={`Members of ${c.name}`}>
                  <thead>
                    <tr className="border-y border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                      <th className="px-5 py-2.5">Learner</th>
                      <th className="px-3 py-2.5">Email</th>
                      <th className="px-3 py-2.5">Joined</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {c.learners.map((l) => (
                      <tr key={l.id} className="border-b border-surface-border last:border-0">
                        <td className="px-5 py-3 font-medium text-ink">{l.name}</td>
                        <td className="px-3 py-3 text-ink-muted">{l.email}</td>
                        <td className="px-3 py-3 text-ink-muted">{day(l.joinedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <ActionButton
                            path={`/instructor/cohorts/${c.id}/members/${l.id}`}
                            label="Remove"
                            confirmText={`Remove ${l.name} from ${c.name}?`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
