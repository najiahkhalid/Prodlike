import { posix } from 'node:path';

/** Folders a learner can never read or write through the file API. */
const PROTECTED = ['node_modules', '.git', '.hidden-tests'];

/**
 * Normalise a workspace-relative path and reject anything outside /workspace.
 * Returns null for an unsafe path.
 */
export function safeWorkspacePath(raw: string): string | null {
  if (!raw || raw.length > 200 || raw.includes('\0')) return null;
  const unix = raw.replace(/\\/g, '/').trim();
  if (unix.startsWith('/') || /^[a-zA-Z]:/.test(unix)) return null;
  const norm = posix.normalize(unix).replace(/^\.\/+/, '');
  if (norm === '.' || norm === '' || norm.startsWith('..') || norm.split('/').includes('..')) return null;
  if (PROTECTED.some((p) => norm === p || norm.startsWith(`${p}/`))) return null;
  if (!/^[\w./ -]+$/.test(norm)) return null;
  return norm;
}
