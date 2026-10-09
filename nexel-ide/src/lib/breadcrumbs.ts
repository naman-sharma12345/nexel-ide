/** Splits a file path into breadcrumb segments, relative to the workspace root when it lives inside it. */
export interface Crumb { label: string; isFile: boolean; }

export function toCrumbs(filePath: string, rootPath?: string | null, maxSegments = 6): Crumb[] {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  let p = norm(filePath || '');
  const root = rootPath ? norm(rootPath) : '';
  let prefix: string[] = [];
  if (root && (p.toLowerCase() === root.toLowerCase() || p.toLowerCase().startsWith(root.toLowerCase() + '/'))) {
    const rootName = root.split('/').filter(Boolean).pop() ?? '';
    p = p.slice(root.length);
    if (rootName) prefix = [rootName];
  }
  const parts = [...prefix, ...p.split('/').filter(Boolean)];
  let crumbs: Crumb[] = parts.map((label, i) => ({ label, isFile: i === parts.length - 1 }));
  if (crumbs.length > maxSegments) {
    // keep the first (workspace) and the tail; collapse the middle into an ellipsis crumb
    crumbs = [crumbs[0], { label: '…', isFile: false }, ...crumbs.slice(-(maxSegments - 2))];
  }
  return crumbs;
}
