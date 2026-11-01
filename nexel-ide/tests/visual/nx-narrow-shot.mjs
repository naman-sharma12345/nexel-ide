// Narrow-window responsive check: welcome card must stay fully visible.
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/narrow';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const [w, h] of [[1280, 720], [725, 800], [720, 480], [520, 800], [380, 800]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
  await page.addInitScript(() => {
    const store = new Map();
    store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: null, rootName: '', activeDir: null, searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
    window.nexelAPI = {
      minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
      openWorkspaceDir: async () => null, readWorkspaceFiles: async () => [],
      createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n, renameNode: async (o, n) => n, deleteNode: async () => true,
      readFileContent: async () => '', writeFileContent: async () => true,
      createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
      runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }), fetchContestProblems: async () => ({}),
      onCompanionProblem() {},
      getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
      lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
      onLspMessage: () => {}, onLspStatus: () => {}, lspSend: async () => true,
    };
  });
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const clip = await page.evaluate(() => {
    const el = document.querySelector('.nx-welcome-glass-plate');
    if (!el) return 'no-card';
    const r = el.getBoundingClientRect();
    const backdrop = document.querySelector('.nx-editor-welcome-backdrop');
    const last = document.querySelector('.nx-keycap-row:last-of-type');
    const lastR = last ? last.getBoundingClientRect() : null;
    return JSON.stringify({
      left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth,
      clippedRight: r.right > window.innerWidth, clippedLeft: r.left < 0,
      vh: window.innerHeight, cardH: Math.round(r.height),
      scrollable: backdrop ? backdrop.scrollHeight > backdrop.clientHeight : false,
      lastRowVisible: lastR ? lastR.bottom <= window.innerHeight : null,
    });
  });
  console.log(w + 'x' + h, clip);
  await page.screenshot({ path: `${dir}/narrow-${w}x${h}.png` });
  await page.close();
}
await browser.close();
console.log('done');
