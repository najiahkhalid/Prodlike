import { z } from 'zod';
import { renderText } from './variants';

/**
 * Reference playthroughs (scenarios/<slug>/solutions/*.yaml, ADR-010). They are never copied into
 * the sandbox image; tests play them through the real API to prove that every valid fix earns full
 * correctness (FR-14) and that every recovery path works.
 */
export const SolutionEditSchema = z.union([
  z.object({ file: z.string().min(1), find: z.string().min(1), replace: z.string() }),
  z.object({ file: z.string().min(1), pattern: z.string().min(1), replace: z.string() }),
  z.object({ file: z.string().min(1), append: z.string().min(1) }),
]);
export type SolutionEdit = z.infer<typeof SolutionEditSchema>;

export const SolutionSchema = z.object({
  name: z.string().min(1),
  /** Edits made before shipping. */
  edits: z.array(SolutionEditSchema).min(1),
  /** What the learner does before deploying. */
  before: z.array(z.enum(['git-log', 'run-tests'])).default([]),
  deploy: z.enum(['direct', 'canary']),
  /** Recovery steps, in order (empty = the incident was prevented). */
  recover: z.array(z.enum(['rollback', 'hotfix'])).default([]),
  hotfixEdits: z.array(SolutionEditSchema).default([]),
  /** Edits made after recovery, before finishing. */
  afterEdits: z.array(SolutionEditSchema).default([]),
  expect: z.object({
    incident: z.boolean(),
    resolvedBy: z.enum(['rollback', 'hotfix', 'prevented']),
    minScore: z.number().int().min(0).max(100),
  }),
});
export type Solution = z.infer<typeof SolutionSchema>;

/** Apply one edit to a file's content. Strings may use the attempt's variant placeholders. */
export function applyEdit(content: string, edit: SolutionEdit, params: Record<string, string> = {}): string {
  if ('append' in edit) {
    return `${content}${content.endsWith('\n') ? '' : '\n'}${renderText(edit.append, params)}`;
  }
  const replacement = renderText(edit.replace, params);
  if ('find' in edit) {
    const find = renderText(edit.find, params);
    if (!content.includes(find))
      throw new Error(`${edit.file}: text to replace not found: ${JSON.stringify(find)}`);
    return content.replace(find, () => replacement);
  }
  const re = new RegExp(renderText(edit.pattern, params), 'm');
  if (!re.test(content)) throw new Error(`${edit.file}: pattern not found: ${edit.pattern}`);
  return content.replace(re, () => replacement);
}
