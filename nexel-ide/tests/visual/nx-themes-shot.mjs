import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/themes';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const THEMES = ['midnight','ember','sakura','mono','frost','forest','gold','aurora','dusk'];
for (const theme of THEMES) {
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript((t) => { window.__NX_THEME = t; }, theme);
await page.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-settings', JSON.stringify({ state: { theme: window.__NX_THEME }, version: 0 }));
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
    runJudge: async () => [
      { id: 1, verdict: 'AC', actual: '4', diff: '', metrics: { time: 12, memory: 2048, exitCode: 0 } },
      { id: 2, verdict: 'WA', actual: '5', diff: 'expected 4 got 5', metrics: { time: 9, memory: 2048, exitCode: 0 } },
    ],
    fetchContests: async () => ({
      active: [{ id: 101, name: 'Codeforces Round 980 (Div. 2)', startTimeSeconds: nowSec - 1800, durationSeconds: 7200 }],
      upcoming: [{ id: 102, name: 'Educational Codeforces Round 170', startTimeSeconds: nowSec + 86400, durationSeconds: 7200 }, { id: 103, name: 'Codeforces Global Round 27', startTimeSeconds: nowSec + 259200, durationSeconds: 9000 }],
      passed: [{ id: 99, name: 'Codeforces Round 978 (Div. 3)', startTimeSeconds: nowSec - 604800, durationSeconds: 7200 }],
    }),
    fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {},
  };
});
await page.goto('http://localhost:5199');
await page.waitForTimeout(2000);
await page.click('text=solve.cpp');
await page.waitForTimeout(1200);
const boxes = fs.existsSync(dir + '/bboxes.json') ? JSON.parse(fs.readFileSync(dir + '/bboxes.json','utf8')) : {};
const grab = async (shot, entries) => {
  boxes[shot] = {};
  for (const [name, sel] of Object.entries(entries)) {
    const el = page.locator(sel).first();
    if (await el.count()) boxes[shot][name] = await el.boundingBox();
  }
};

{
  const needP = !fs.existsSync(dir + '/' + theme + '-passed.png') || !boxes[theme + '-passed'];
  const needF = !fs.existsSync(dir + '/' + theme + '-failed.png') || !boxes[theme + '-failed'];
  if (!needP && !needF) { await page.close(); continue; }
}
await page.goto('http://localhost:5199');
await page.waitForTimeout(2000);
await page.click('text=solve.cpp');
await page.waitForTimeout(1200);
await page.locator('.nd-item-row').nth(1).click();
await page.waitForTimeout(1400);
await page.click('.nx-judge-textarea').catch(()=>{});
await page.keyboard.type('2');
await page.waitForTimeout(300);
await page.click('.nx-judge-run-btn').catch(async () => { await page.click('button:has-text("RUN")'); });
await page.waitForTimeout(2500);
if (!fs.existsSync(dir + '/' + theme + '-passed.png') || !boxes[theme + '-passed']) {
await page.screenshot({ path: dir + '/' + theme + '-passed.png' });
await grab(theme + '-passed', {
  pill: '.nx-tc-pill.passed.active',
  pill_name: '.nx-tc-pill.passed.active .nx-tc-pill-name',
  pill_badge: '.nx-tc-pill.passed.active .nx-tc-verdict-dot',
  pill_badge_bg: '.nx-tc-pill.passed.active',
});
await page.click('.nx-tc-add-btn').catch(()=>{});
await page.waitForTimeout(400);
await page.click('.nx-judge-run-btn').catch(async () => { await page.click('button:has-text("RUN")'); });
await page.waitForTimeout(2500);
await page.locator('.nx-tc-pill').nth(1).click().catch(()=>{});
await page.waitForTimeout(400);
}
fs.writeFileSync(dir + '/bboxes.json', JSON.stringify(boxes, null, 1));
if (!fs.existsSync(dir + '/' + theme + '-failed.png') || !boxes[theme + '-failed']) {
await page.screenshot({ path: dir + '/' + theme + '-failed.png' });
await grab(theme + '-failed', {
  pill: '.nx-tc-pill.failed.active',
  pill_name: '.nx-tc-pill.failed.active .nx-tc-pill-name',
  pill_badge: '.nx-tc-pill.failed.active .nx-tc-verdict-dot',
  pill_badge_bg: '.nx-tc-pill.failed.active',
});
}
fs.writeFileSync(dir + '/bboxes.json', JSON.stringify(boxes, null, 1));
await page.close();
}
await browser.close();
console.log('theme shots done');
