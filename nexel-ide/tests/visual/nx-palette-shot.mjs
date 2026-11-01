import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/palette';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => [{ name: 'solve.cpp', path: d + '/solve.cpp', type: 'file' }],
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => 'int main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }),
    fetchContestProblems: async () => ({}), onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {},
  };
});
await page.goto('http://localhost:5199');
await page.waitForTimeout(2000);
await page.keyboard.press('Control+k');
await page.waitForTimeout(700);
await page.screenshot({ path: dir + '/c1-palette.png' });
const boxes = {};
const grab = async (shot, entries) => {
  boxes[shot] = {};
  for (const [name, sel] of Object.entries(entries)) {
    const el = page.locator(sel).first();
    if (await el.count()) boxes[shot][name] = await el.boundingBox();
  }
};
await grab('c1', {
  palette: '.nx-cmdk, .nx-palette, [class*="palette"], [role="dialog"]',
  item: '.nx-cmd-item, [class*="cmd-item"], [class*="palette-item"]',
  input: 'input',
});
await page.keyboard.type('theme');
await page.waitForTimeout(500);
await page.screenshot({ path: dir + '/c2-palette-typed.png' });
// settings panel via gear/settings nav item if present
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
fs.writeFileSync(dir + '/bboxes.json', JSON.stringify(boxes, null, 2));
await browser.close();
console.log('done');
