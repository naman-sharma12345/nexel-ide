// Loads Codeforces pages in a real Chromium window (Electron) so Cloudflare lets us through.
// Uses a persistent partition, so the Cloudflare clearance and an optional Codeforces sign-in survive restarts.
// Only codeforces.com URLs are loaded; no password is ever stored, only the session cookies Chromium keeps.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const CF_PARTITION = 'persist:codeforces';

export function isCodeforcesUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)codeforces\.com$/.test(u.hostname); } catch { return false; }
}

export interface LoaderOptions {
  /** How long to wait silently before showing the window so the user can pass a challenge. */
  showAfterMs?: number;
  /** Total time budget per page. */
  timeoutMs?: number;
  parent?: any;
}

/** Create a PageLoader bound to Electron's BrowserWindow class. */
export function createCodeforcesLoader(BrowserWindow: any, opts: LoaderOptions = {}) {
  const showAfterMs = opts.showAfterMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 120000;
  let queue: Promise<unknown> = Promise.resolve();
  let lastLoad = 0;

  const loadOne = (url: string): Promise<string> => new Promise((resolve, reject) => {
    if (!isCodeforcesUrl(url)) { reject(new Error('Only codeforces.com pages can be loaded')); return; }
    const win = new BrowserWindow({
      width: 1000, height: 760, show: false, title: 'Codeforces: verify to continue', parent: opts.parent,
      webPreferences: { partition: CF_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: true },
    });
    win.setMenu?.(null);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e: any, next: string) => { if (!isCodeforcesUrl(next)) e.preventDefault(); });
    let done = false;
    const finish = (err: Error | null, html?: string) => {
      if (done) return; done = true;
      clearInterval(poll); clearTimeout(showTimer); clearTimeout(killTimer);
      if (!win.isDestroyed()) win.destroy();
      if (err) reject(err); else resolve(html ?? '');
    };
    const read = async () => {
      if (done || win.isDestroyed()) return;
      try {
        const html: string = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
        if (/class="problem-statement"/.test(html)) finish(null, html);
        else if (/Problems are not available|You are not registered|enter\b.*\bpassword/i.test(html) && !/cf_chl|challenge-platform/.test(html)) finish(null, html);
      } catch { /* page still navigating */ }
    };
    const poll = setInterval(read, 700);
    const showTimer = setTimeout(() => { if (!done && !win.isDestroyed()) win.show(); }, showAfterMs);
    const killTimer = setTimeout(() => finish(new Error('Timed out waiting for Codeforces (Cloudflare check not passed)')), timeoutMs);
    win.on('closed', () => finish(new Error('Codeforces window closed before the page loaded')));
    win.webContents.on('did-finish-load', read);
    win.loadURL(url, { userAgent: win.webContents.getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*nexel-ide\/\S+/i, '') })
      .catch(() => { /* challenge redirects reject loadURL; polling continues */ });
  });

  // Serialize loads, at least 2s apart (rate limit).
  return (url: string): Promise<string> => {
    const run = queue.then(async () => {
      const wait = lastLoad + 2000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try { return await loadOne(url); } finally { lastLoad = Date.now(); }
    });
    queue = run.catch(() => undefined);
    return run;
  };
}

/** Open a visible Codeforces window on the same partition so the user can sign in or register. */
export function openCodeforcesWindow(BrowserWindow: any, url = 'https://codeforces.com/enter', parent?: any) {
  if (!isCodeforcesUrl(url)) throw new Error('Only codeforces.com pages can be opened');
  const win = new BrowserWindow({ width: 1000, height: 760, parent, title: 'Codeforces', webPreferences: { partition: CF_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenu?.(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e: any, next: string) => { if (!isCodeforcesUrl(next)) e.preventDefault(); });
  win.loadURL(url);
  return win;
}
