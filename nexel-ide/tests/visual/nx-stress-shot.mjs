import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/stress';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }, { name: 'solve_brute.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type })),
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => 'int main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async (file) => [{ id: 1, verdict: 'AC', actual: file.includes('brute') ? '4' : '5', diff: '', metrics: { time: 3, memory: 1024, exitCode: 0 } }],
    fetchContests: async () => ({ active: [], upcoming: [], passed: [] }),
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
await page.waitForTimeout(1000);
await page.locator('.nd-item-row').nth(1).click();
await page.waitForTimeout(1200);
await page.click('.nx-judge-stress-toggle');
await page.waitForTimeout(600);
await page.screenshot({ path: dir + '/s1-stress-idle.png' });
const boxes = {};
const grab = async (shot, entries) => {
  boxes[shot] = {};
  for (const [name, sel] of Object.entries(entries)) {
    const el = page.locator(sel).first();
    if (await el.count()) boxes[shot][name] = await el.boundingBox();
  }
};
await grab('s1', {
  ring: '.nx-stress-ring', ring_txt: '.nx-stress-ring-txt',
  heading_sub: '.nx-stress-heading span',
  field_label: '.nx-stress-field span', field_input: '.nx-stress-field input',
  start_btn: '.nx-stress-btn',
});
await page.locator('.nx-stress-row .nx-stress-field input').first().fill('2000');
await page.click('.nx-stress-btn');
await page.waitForTimeout(500);
await page.screenshot({ path: dir + '/s2-stress-running.png' });
await grab('s2', { ring: '.nx-stress-ring', ring_txt: '.nx-stress-ring-txt', stop_btn: '.nx-stress-btn.stop', heading_sub: '.nx-stress-heading span' });
await page.waitForTimeout(6000);
await page.screenshot({ path: dir + '/s3-stress-fail.png' });
await grab('s3', {
  fail_chip: '.nx-stress-fail-h .chip', fail_head: '.nx-stress-fail-h',
  fail_pre: '.nx-stress-fail pre', fail_diff_a: '.nx-stress-diff .a', fail_diff_b: '.nx-stress-diff .b',
  save_btn: '.nx-stress-btn.ghost',
});
// pass run: matching outputs -> running then pass state
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await ctx2.addInitScript(() => {
  const files = [{ name: 'solve.cpp', type: 'file' }, { name: 'solve_brute.cpp', type: 'file' }];
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type })),
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => 'int main(){}\n', writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [{ id: 1, verdict: 'AC', actual: '4', diff: '', metrics: { time: 3, memory: 1024, exitCode: 0 } }],
    fetchContests: async () => ({ active: [], upcoming: [], passed: [] }),
    fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {},
  };
});
const page2 = await ctx2.newPage();
await page2.goto('http://localhost:5199');
await page2.waitForTimeout(2000);
await page2.click('text=solve.cpp');
await page2.waitForTimeout(1000);
await page2.locator('.nd-item-row').nth(1).click();
await page2.waitForTimeout(1200);
await page2.click('.nx-judge-stress-toggle');
await page2.waitForTimeout(600);
await page2.locator('.nx-stress-row .nx-stress-field input').first().fill('2000');
await page2.click('.nx-stress-btn');
await page2.waitForTimeout(300);
await page2.screenshot({ path: dir + '/s2-stress-running.png' });
boxes['s2'] = {};
for (const [name, sel] of Object.entries({ ring_txt: '.nx-stress-ring-txt', stop_btn: '.nx-stress-btn.stop', heading_sub: '.nx-stress-heading span' })) {
  const el = page2.locator(sel).first();
  if (await el.count()) boxes['s2'][name] = await el.boundingBox();
}
await page2.waitForTimeout(8000);
await page2.screenshot({ path: dir + '/s4-stress-pass.png' });
boxes['s4'] = {};
for (const [name, sel] of Object.entries({ ring_txt: '.nx-stress-ring-txt', heading_sub: '.nx-stress-heading span' })) {
  const el = page2.locator(sel).first();
  if (await el.count()) boxes['s4'][name] = await el.boundingBox();
}
fs.writeFileSync(dir + '/bboxes.json', JSON.stringify(boxes, null, 2));
await browser.close();
console.log('done');
