/** Session restore: remembers which files were open (paths only, never contents) per workspace. */
export interface Session { root: string; paths: string[]; active: string | null }
const KEY = 'nexel-session-v1';
const MAX_TABS = 24;
const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();

export const isInside = (root: string, p: string) => { const r = norm(root).replace(/\/+$/, ''); const q = norm(p); return q.startsWith(r + '/'); };

/** Validates untrusted JSON from storage: strings only, bounded, and every path must live inside the workspace root. */
export function sanitizeSession(raw: unknown, root: string): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.root !== 'string' || norm(r.root) !== norm(root) || !Array.isArray(r.paths)) return null;
  const seen = new Set<string>();
  const paths = r.paths.filter((p): p is string => typeof p === 'string' && p.length < 1024 && !p.includes('..') && isInside(root, p))
    .filter(p => !seen.has(p) && !!seen.add(p)).slice(0, MAX_TABS);
  const active = typeof r.active === 'string' && paths.includes(r.active) ? r.active : (paths[0] ?? null);
  return paths.length ? { root, paths, active } : null;
}

export function saveSession(s: Session, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(KEY, JSON.stringify({ root: s.root, paths: s.paths.slice(0, MAX_TABS), active: s.active })); } catch { /* quota/private mode: non-fatal */ }
}
export function loadSession(root: string, storage: Pick<Storage, 'getItem'> = localStorage): Session | null {
  try { const t = storage.getItem(KEY); return t ? sanitizeSession(JSON.parse(t), root) : null; } catch { return null; }
}
