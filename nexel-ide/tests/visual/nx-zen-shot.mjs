import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/zen';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type, ...(f.type === 'folder' ? { isOpen: false, children: [] } : {}) })),
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
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
await page.waitForTimeout(1200);
await page.click('.nx-node-name:has-text("solve.cpp")').catch(async () => { await page.click('text=solve.cpp'); });
await page.waitForTimeout(1500);
await page.screenshot({ path: dir + '/z1-before.png' });
await page.keyboard.press('Control+Alt+z');
await page.waitForTimeout(800);
await page.screenshot({ path: dir + '/z2-zen.png' });
const vis = await page.evaluate(() => {
  const sb = document.querySelector('.sb-bar');
  const cs = sb ? getComputedStyle(sb) : null;
  return JSON.stringify({ zen: document.documentElement.classList.contains('nx-zen'), sbOpacity: cs?.opacity, sbPE: cs?.pointerEvents });
});
console.log('zen state:', vis);
await page.keyboard.press('Control+Alt+z');
await page.waitForTimeout(700);
await page.screenshot({ path: dir + '/z3-exit.png' });
await browser.close();
console.log('done');
