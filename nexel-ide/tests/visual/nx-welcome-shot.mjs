import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/welcome';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, store] of [['dark', new Map()], ['light', new Map([['nexel-settings', JSON.stringify({ state: { theme: 'light' }, version: 0 })]])]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await page.addInitScript((s) => {
    const m = new Map(s);
    window.nexelAPI = {
      minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
      openWorkspaceDir: async () => null, readWorkspaceFiles: async () => [],
      createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
      renameNode: async (o, n) => n, deleteNode: async () => true,
      readFileContent: async () => '', writeFileContent: async () => true,
      createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
      runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }),
      fetchContestProblems: async () => ({}), onCompanionProblem() {},
      getStoreSync: (k) => m.get(k), setStoreSync: (k, v) => m.set(k, v), deleteStoreSync: (k) => m.delete(k),
      lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
      onLspMessage: () => {}, onLspStatus: () => {},
    };
  }, [...store]);
  await page.goto('http://localhost:5199');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/welcome-${name}.png` });
  await page.close();
}
await browser.close();
console.log('done');
