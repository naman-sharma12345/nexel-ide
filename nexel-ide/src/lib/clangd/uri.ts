// file:// URI <-> filesystem path mapping shared by Monaco models and clangd.
// Handles POSIX paths, Windows drive letters (C:\a or C:/a), UNC shares (\\server\share) and percent-encoding.

const WIN_DRIVE = /^[A-Za-z]:([\\/]|$)/;

/** Encodes one path segment the way VS Code / clangd expect. */
function encodeSegment(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Absolute path -> file URI. Drive letters are upper-cased and the colon is kept literal: file:///C:/dir/a%20b.cpp */
export function pathToUri(p: string): string {
  if (/^file:\/\//i.test(p)) return p;
  let s = p.replace(/\\/g, '/');
  let authority = '';
  if (s.startsWith('//')) { // UNC: //server/share/x
    const rest = s.slice(2); const i = rest.indexOf('/');
    authority = i < 0 ? rest : rest.slice(0, i);
    s = i < 0 ? '/' : rest.slice(i);
  } else if (WIN_DRIVE.test(s)) {
    s = '/' + s[0].toUpperCase() + s.slice(1);
  } else if (!s.startsWith('/')) {
    s = '/' + s;
  }
  const encoded = s.split('/').map((seg, i) => (i === 1 && /^[A-Z]:$/.test(seg) ? seg : encodeSegment(seg))).join('/');
  return `file://${authority}${encoded}`;
}

/** File URI -> native-looking path (Windows drive paths use backslashes; POSIX stays POSIX). */
export function uriToPath(uri: string): string {
  const m = /^file:\/\/([^/]*)(\/.*)?$/i.exec(uri);
  if (!m) return uri;
  const authority = m[1];
  let p = decodeURIComponent(m[2] ?? '/');
  if (authority && authority.toLowerCase() !== 'localhost') return `\\\\${authority}${p.replace(/\//g, '\\')}`;
  if (/^\/[A-Za-z]:(\/|$)/.test(p)) { p = p[1].toUpperCase() + p.slice(2); return p.replace(/\//g, '\\'); }
  return p;
}

/** Canonical comparison key: decoded, forward slashes, lower-cased Windows paths (NTFS is case-insensitive). */
export function uriKey(uriOrPath: string): string {
  const p = /^file:\/\//i.test(uriOrPath) ? uriToPath(uriOrPath) : uriOrPath;
  const s = p.replace(/\\/g, '/');
  return WIN_DRIVE.test(s) || s.startsWith('//') ? s.toLowerCase() : s;
}

export function samePath(a: string, b: string) { return uriKey(a) === uriKey(b); }

/** LSP language id for a file, or null when clangd should not see it. */
export function clangdLanguageFor(path: string): 'cpp' | 'c' | null {
  const name = path.split(/[\\/]/).pop() ?? '';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (ext === 'c') return 'c';
  if (['cpp', 'cc', 'cxx', 'c++', 'h', 'hpp', 'hh', 'hxx', 'ipp', 'tpp', 'inl'].includes(ext)) return 'cpp';
  return null;
}
