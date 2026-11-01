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
const boxes = {};
const grab = async (shot, entries) => {
  boxes[shot] = {};
  for (const [name, sel] of Object.entries(entries)) {
    const el = page.locator(sel).first();
    if (await el.count()) boxes[shot][name] = await el.boundingBox();
  }
};
await page.screenshot({ path: dir + '/p0-explorer.png' });
await grab('p0', { explorer_ext: '.nx-file-ext' });
await page.locator('.nd-item-row').nth(1).click();
await page.locator('.nx-judge-textarea').first().waitFor({ timeout: 5000 }).catch(()=>{});
await page.waitForTimeout(1400);
await page.screenshot({ path: dir + '/p1-judge.png' });
// run with TC1 only -> AC (passed.active)
await page.click('.nx-judge-textarea').catch(()=>{});
await page.keyboard.type('2');
await page.waitForTimeout(300);
await page.click('.nx-judge-run-btn').catch(async () => { await page.click('button:has-text("RUN")'); });
await page.waitForTimeout(2500);
await page.screenshot({ path: dir + '/p3-judge-verdicts.png' });
await grab('p3', {
  pill: '.nx-tc-pill.passed.active',
  pill_name: '.nx-tc-pill.passed.active .nx-tc-pill-name',
  pill_badge: '.nx-tc-pill.passed.active .nx-tc-verdict-dot',
  pill_badge_bg: '.nx-tc-pill.passed.active',
});
// add TC2 -> rerun -> WA (failed.active)
await page.click('.nx-tc-add-btn').catch(()=>{});
await page.waitForTimeout(400);
await page.click('.nx-judge-run-btn').catch(async () => { await page.click('button:has-text("RUN")'); });
await page.waitForTimeout(2500);
await page.locator('.nx-tc-pill').nth(1).click().catch(()=>{});
await page.waitForTimeout(400);
await page.screenshot({ path: dir + '/p4-judge-mixed.png' });
await grab('p4', {
  pill: '.nx-tc-pill.failed.active',
  pill_name: '.nx-tc-pill.failed.active .nx-tc-pill-name',
  pill_badge: '.nx-tc-pill.failed.active .nx-tc-verdict-dot',
  pill_passed: '.nx-tc-pill.passed:not(.active)',
  pill_passed_badge: '.nx-tc-pill.passed:not(.active) .nx-tc-verdict-dot',
  pill_badge_bg: '.nx-tc-pill.failed.active',
});
// contests
await page.locator('.nd-item-row').nth(2).click();
await page.locator('.nx-contests-custom-input').fill('1981A').catch(()=>{});
await page.waitForTimeout(1800);
await page.screenshot({ path: dir + '/p2-contests.png' });
await grab('p2', {
  contest_card: '.nx-contest-card.upcoming-card',
  contest_id: '.nx-contest-card.upcoming-card .nx-contest-id',
  contest_duration: '.nx-contest-card.upcoming-card .nx-contest-duration',
  contest_date: '.nx-contest-card.upcoming-card .nx-contest-time-info span',
  import_btn: 'button:has-text("Import")',
});
fs.writeFileSync(dir + '/bboxes.json', JSON.stringify(boxes, null, 2));
await browser.close();
console.log('done');
