'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@prodlike/ui';
import { CreateVariantSchema, type ScenarioBrief, type VariantView } from '@prodlike/shared';
import { Field, FormError } from '@/components/auth/Field';
import { ClientApiError, clientApi } from '@/lib/client-api';

/**
 * Scenario Builder (FR-19): a form over an existing scenario. It edits the brief, switches the
 * incident on or off and re-weights the rubric; the API validates the result with the shared schema.
 */
export function BuilderForm({ bases }: { bases: ScenarioBrief[] }) {
  const router = useRouter();
  const [baseSlug, setBaseSlug] = useState(bases[0]?.slug ?? '');
  const base = useMemo(() => bases.find((b) => b.slug === baseSlug), [bases, baseSlug]);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries((bases[0]?.rubric ?? []).map((r) => [r.id, r.weight])),
  );
  const [error, setError] = useState<{ message: string; action?: string }>();
  const [created, setCreated] = useState<VariantView>();
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  if (!base) return <p className="text-ink-muted">No scenarios are available to build from.</p>;

  function pickBase(slug: string) {
    setBaseSlug(slug);
    const b = bases.find((x) => x.slug === slug);
    setWeights(Object.fromEntries((b?.rubric ?? []).map((r) => [r.id, r.weight])));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      basedOn: baseSlug,
      title: String(f.get('title') ?? ''),
      ticketTitle: String(f.get('ticketTitle') ?? ''),
      ticketBody: String(f.get('ticketBody') ?? ''),
      faultsEnabled: f.get('faults') === 'on',
      weights,
      hintPenalty: Number(f.get('hintPenalty') ?? 5),
    };
    const parsed = CreateVariantSchema.safeParse(input);
    if (!parsed.success) {
      setError({ message: parsed.error.issues[0].message });
      return;
    }
    try {
      const v = await clientApi<VariantView>('/instructor/variants', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setCreated(v);
      setError(undefined);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? { message: err.body.message, action: err.body.action }
          : { message: 'Could not save.' },
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate key={baseSlug}>
      <FormError {...error} />
      {created && (
        <p role="status" className="mb-4 rounded-sm bg-ok-tint px-3 py-2.5 text-sm text-ok-text">
          <b>“{created.title}” saved.</b> It is private to you: assign it to a class from the Instructor
          Dashboard.
        </p>
      )}
      <label htmlFor="basedOn" className="field-label">
        Start from
      </label>
      <select
        id="basedOn"
        className="field-input mb-4"
        value={baseSlug}
        onChange={(e) => pickBase(e.target.value)}
      >
        {bases.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.title}
          </option>
        ))}
      </select>
      <Field id="title" label="Variant title" defaultValue={`${base.title}: lab version`} />
      <Field id="ticketTitle" label="Ticket title" defaultValue={base.brief.title} />
      <div className="mb-4">
        <label htmlFor="ticketBody" className="field-label">
          Ticket description
        </label>
        <textarea
          id="ticketBody"
          name="ticketBody"
          rows={4}
          className="field-input"
          defaultValue={base.brief.body}
        />
      </div>
      <label className="mb-4 flex items-start gap-2 text-sm">
        <input type="checkbox" name="faults" defaultChecked className="mt-1" />
        <span>
          <b>Inject the production incident after deploy.</b>
          <span className="block text-ink-muted">
            Turn off for a pure coding exercise: incident hints and debrief tips are removed too.
          </span>
        </span>
      </label>

      <fieldset className="mb-4">
        <legend className="field-label">
          Rubric weights{' '}
          <span
            className={`font-mono ${total === 100 ? 'text-ok-text' : 'text-bad-text'}`}
            data-testid="weight-total"
          >
            ({total}/100)
          </span>
        </legend>
        <p className="mb-2 text-xs text-ink-muted">
          Set an item to 0 to drop it. Weights must add up to 100.
        </p>
        <div className="grid gap-2">
          {base.rubric.map((r) => (
            <label
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-sm border border-surface-border px-3 py-2 text-sm"
            >
              <span>
                {r.label} <span className="text-xs text-ink-muted">({r.skill})</span>
              </span>
              <input
                type="number"
                min={0}
                max={100}
                aria-label={`Weight for ${r.label}`}
                className="field-input w-20 py-1 text-right font-mono"
                value={weights[r.id] ?? 0}
                onChange={(e) =>
                  setWeights((w) => ({
                    ...w,
                    [r.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  }))
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        id="hintPenalty"
        label="Points lost per hint"
        type="number"
        min={0}
        max={20}
        defaultValue={base.hintPenalty}
      />
      <Button type="submit" disabled={total !== 100}>
        Save variant
      </Button>
    </form>
  );
}
