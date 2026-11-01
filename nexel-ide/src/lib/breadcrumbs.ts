/** Splits a file path into breadcrumb segments, relative to the workspace root when it lives inside it. */
export interface Crumb { label: string; isFile: boolean; path: string | null; }

export function toCrumbs(filePath: string, rootPath?: string | null, maxSegments = 6): Crumb[] {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const p = norm(filePath || '');
  const root = rootPath ? norm(rootPath) : '';
  let prefixLabel: string | null = null;
  let rel = p;
  if (root && (p.toLowerCase() === root.toLowerCase() || p.toLowerCase().startsWith(root.toLowerCase() + '/'))) {
    prefixLabel = root.split('/').filter(Boolean).pop() ?? null;
    rel = p.slice(root.length);
  }
  const segs = rel.split('/').filter(Boolean);
  const isWin = /^[A-Za-z]:\//.test(p);
  const join = (parts: string[]) => (isWin ? parts.join('/') : '/' + parts.join('/'));
  const rootParts = root ? root.split('/').filter(Boolean) : [];

  let crumbs: Crumb[] = [];
  if (prefixLabel) {
    crumbs.push({ label: prefixLabel, isFile: segs.length === 0, path: root });
  }
  segs.forEach((label, i) => {
    const absParts = prefixLabel ? [...rootParts, ...segs.slice(0, i + 1)] : segs.slice(0, i + 1);
    const abs = join(absParts);
    crumbs.push({ label, isFile: i === segs.length - 1, path: abs });
  });
  if (crumbs.length > maxSegments) {
    // keep the first (workspace) and the tail; collapse the middle into an ellipsis crumb
    crumbs = [crumbs[0], { label: '…', isFile: false, path: null }, ...crumbs.slice(-(maxSegments - 2))];
  }
  return crumbs;
}
