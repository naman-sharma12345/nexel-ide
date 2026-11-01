import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/toasts';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.addInitScript(() => {
  const files = [];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type, ...(f.type === 'folder' ? { isOpen: false, children: [] } : {}) })),
    createFile: async (p, n) => { files.push({ name: n, type: 'file' }); return p + '/' + n; },
    createFolder: async (p, n) => { files.push({ name: n, type: 'folder' }); return p + '/' + n; },
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => '#include <bits/stdc++.h>\nint main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }), fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {}, lspSend: async () => true,
  };
});
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// create + open a file
await page.click('.nx-empty-action-btn:has-text("New File")');
await page.waitForTimeout(400);
await page.fill('.nx-inline-textbox', 'solve.cpp');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
// click into editor and save -> success toast
await page.click('.monaco-editor .view-lines').catch(()=>{});
await page.waitForTimeout(300);
await page.keyboard.type('// edit to make dirty');
await page.waitForTimeout(500);
await page.keyboard.press('Control+s');
await page.waitForTimeout(900);
await page.screenshot({ path: dir + '/t1-save-toast.png' });
const stack = await page.$('.tz-toast');
if (stack) {
  await stack.screenshot({ path: dir + '/t2-toast-closeup.png' });
  const cs = await page.evaluate(() => {
    const el = document.querySelector('.tz-toast');
    const c = getComputedStyle(el);
    return { backdropFilter: c.backdropFilter, background: c.background.slice(0, 90), boxShadow: c.boxShadow.slice(0, 140), borderRadius: c.borderRadius };
  });
  console.log('TOAST_PROBE', JSON.stringify(cs));
  const ok = cs.backdropFilter === 'none' && !/0 0 \d+px 0|rgba\(16, 185, 129/.test(cs.boxShadow);
  console.log(ok ? 'TOAST_FLAT_OK' : 'TOAST_FLAT_FAIL');
} else console.log('NO TOAST');
await browser.close();
console.log('done');
