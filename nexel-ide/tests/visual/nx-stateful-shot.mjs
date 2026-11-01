import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/stateful';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.addInitScript(() => {
  const files = [];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/empty-ws', rootName: 'EMPTY-WS', activeDir: 'C:/empty-ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/empty-ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type, ...(f.type === 'folder' ? { isOpen: false, children: [] } : {}) })),
    createFile: async (p, n) => { files.push({ name: n, type: 'file' }); return p + '/' + n; },
    createFolder: async (p, n) => { files.push({ name: n, type: 'folder' }); return p + '/' + n; },
    renameNode: async (o, n) => n, deleteNode: async () => true,
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
await page.waitForTimeout(1800);
await page.screenshot({ path: dir + '/s1-empty.png' });
await page.click('.nx-empty-action-btn:has-text("New File")');
await page.waitForTimeout(500);
await page.fill('.nx-inline-textbox', 'solve.cpp');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.screenshot({ path: dir + '/s2-file-created.png' });
await page.click('button[title="New Folder"]');
await page.waitForTimeout(500);
await page.fill('.nx-inline-textbox', 'stress');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.screenshot({ path: dir + '/s3-folder-created.png' });
// refresh from "disk": entries must persist
await page.click('button[title="Refresh Tree"]');
await page.waitForTimeout(900);
await page.screenshot({ path: dir + '/s4-after-refresh.png' });
const names = await page.$$eval('.nx-node-name, .nx-tree-node', els => els.map(e => e.textContent));
console.log('tree entries:', JSON.stringify(names));
await browser.close();
console.log('done');
