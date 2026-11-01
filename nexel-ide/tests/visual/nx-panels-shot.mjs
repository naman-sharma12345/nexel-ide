import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/panels';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  const nowSec = Math.floor(Date.now() / 1000);
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type, ...(f.type === 'folder' ? { isOpen: false, children: [] } : {}) })),
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => 'int main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [{ id: 1, verdict: 'AC', actual: '4', timeMs: 12 }, { id: 2, verdict: 'WA', actual: '5', timeMs: 9 }],
    fetchContests: async () => ({
      active: [{ id: 101, name: 'Codeforces Round 980 (Div. 2)', startTimeSeconds: nowSec - 1800, durationSeconds: 7200 }],
      upcoming: [{ id: 102, name: 'Educational Codeforces Round 170', startTimeSeconds: nowSec + 86400, durationSeconds: 7200 }, { id: 103, name: 'Codeforces Global Round 27', startTimeSeconds: nowSec + 259200, durationSeconds: 9000 }],
      passed: [{ id: 99, name: 'Codeforces Round 978 (Div. 3)', startTimeSeconds: nowSec - 604800, durationSeconds: 7200 }],
    }),
    fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {}, lspSend: async () => true,
  };
});
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rows = page.locator('.nd-item-row');
await rows.nth(1).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + '/p1-judge.png' });
await rows.nth(2).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: dir + '/p2-contests.png' });
await browser.close();
console.log('done');
