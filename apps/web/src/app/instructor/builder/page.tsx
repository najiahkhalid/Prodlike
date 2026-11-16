import Link from 'next/link';
import { Badge, Card } from '@prodlike/ui';
import type { CatalogueResponse, ScenarioBrief, VariantView } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { BuilderForm } from '@/components/instructor/BuilderForm';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Scenario Builder' };

/** Scenario Builder (FR-19): variants of existing scenarios, private to their author until assigned. */
export default async function BuilderPage() {
  const me = await requireMe('/instructor/builder');
  const [catalogue, variants] = await Promise.all([
    serverApi<CatalogueResponse>('/scenarios'),
    serverApi<VariantView[]>('/instructor/variants'),
  ]);
  const mine = variants.ok ? variants.data : [];
  const variantSlugs = new Set(mine.map((v) => v.slug));
  const baseSlugs = (catalogue.ok ? catalogue.data.items : []).filter(
    (s) => !variantSlugs.has(s.slug) && s.published,
  );
  const briefs = (await Promise.all(baseSlugs.map((s) => serverApi<ScenarioBrief>(`/scenarios/${s.slug}`))))
    .filter((r) => r.ok)
    .map((r) => (r as { data: ScenarioBrief }).data);

  return (
    <AppShell me={me} active="/instructor/builder" crumbs="Instructor" title="Scenario Builder">
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">New variant</h2>
          <p className="mb-5 text-sm text-ink-muted">
            A variant reuses a scenario&apos;s codebase and sandbox, with your own ticket, incident setting
            and marking weights. The hidden tests stay the same, so any correct fix still earns full marks.
          </p>
          <BuilderForm bases={briefs} />
        </Card>
        <Card className="p-0">
          <h2 className="px-5 pb-2 pt-5 text-lg font-semibold">Your variants</h2>
          {mine.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink-muted">None yet.</p>
          ) : (
            <ul>
              {mine.map((v) => (
                <li key={v.slug} className="border-t border-surface-border px-5 py-3">
                  <Link href={`/scenarios/${v.slug}`} className="font-semibold text-ink hover:text-primary">
                    {v.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                    <Badge>{v.published ? 'Published' : 'Private'}</Badge>
                    based on <span className="font-mono">{v.basedOn}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
