import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/seam-on';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-settings', JSON.stringify({ state: { plugins: { 'competitive-programming': true } }, version: 0 }));
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type })),
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => 'int main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [],
    fetchContests: async () => ({ active: [], upcoming: [], passed: [] }),
    fetchContestProblems: async () => ({}), onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {},
  };
});
await page.goto('http://localhost:5199');
await page.waitForTimeout(2000);
await page.click('text=solve.cpp');
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + '/seamon-workspace.png' });
await page.keyboard.press('Control+,');
await page.waitForTimeout(1200);
await page.screenshot({ path: dir + '/seamon-settings.png' });
await page.locator('.sp-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(800);
await page.screenshot({ path: dir + '/seamon-extensions.png' });
await browser.close();
console.log('done');
