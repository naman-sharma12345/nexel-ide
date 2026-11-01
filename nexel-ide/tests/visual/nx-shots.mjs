// Baseline/iteration screenshot harness for Nexel IDE. Usage:
//   node /tmp/nxshots/shoot.mjs <outDir> [themeId1,themeId2,...]
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2] || '/tmp/nxshots/out';
const onlyThemes = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
page.on('pageerror', e => console.log('PAGEERR', e.message));

await page.addInitScript(() => {
  const code = ['#include <bits/stdc++.h>','using namespace std;','','int main() {','    ios::sync_with_stdio(false);','    cin.tie(nullptr);','    int n; cin >> n;','    vector<int> v(n);','    for (auto &x : v) cin >> x;','    sort(v.begin(), v.end());','    cout << v.back() << "\\n";','    return 0;','}',''].join('\n');
  const store = new Map();
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: ['C:/cp-workspace'], pinnedPaths: [], rootPath: null, rootName: '', activeDir: null, searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/cp-workspace',
    readWorkspaceFiles: async (d) => [{ name: 'main.cpp', path: d + '/main.cpp', type: 'file' }, { name: 'input.txt', path: d + '/input.txt', type: 'file' }, { name: 'output.txt', path: d + '/output.txt', type: 'file' }],
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n, renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => code, writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [{ name: 'Test 1', verdict: 'AC', timeMs: 42 }, { name: 'Test 2', verdict: 'WA', timeMs: 57 }],
    fetchContests: async () => ({ active: [], upcoming: [{ id: 1, name: 'Codeforces Round 990 (Div. 2)', startTimeSeconds: Math.floor(Date.now()/1000) + 86400, durationSeconds: 7200 }], passed: [] }),
    fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
    onLspMessage: () => {}, onLspStatus: () => {}, lspSend: async () => true,
  };
});

const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` });
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot('00-welcome');

// open workspace
for (const sel of ['text=Open Folder', 'text=Open Workspace', 'text=OPEN FOLDER', 'button:has-text("Open")']) {
  const el = await page.$(sel); if (el) { await el.click().catch(() => {}); break; }
}
await page.waitForTimeout(900);
await page.click('text=main.cpp');
await page.waitForSelector('.monaco-editor .view-lines');
await page.waitForTimeout(1800);
await shot('01-editor');

// terminal via palette
await page.keyboard.press('Control+Shift+P'); await page.waitForTimeout(500);
await page.keyboard.type('Toggle Terminal'); await page.waitForTimeout(400);
await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
await shot('02-terminal');
await page.keyboard.press('Control+Shift+P'); await page.waitForTimeout(400);
await page.keyboard.type('Toggle Terminal'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(600);

// judge view
const items = await page.$$('.nd-item-row');
console.log('nav items:', items.length);
try { if (items[1]) { await items[1].click(); await page.waitForTimeout(1200); await shot('03-judge'); } } catch (e) { console.log('judge fail', e.message); }
try { if (items[2]) { await items[2].click(); await page.waitForTimeout(1500); await shot('04-contests'); } } catch (e) { console.log('contests fail', e.message); }
try { if (items[0]) { await items[0].click(); await page.waitForTimeout(800); } } catch (e) { console.log('ws fail', e.message); }

// command palette
await page.keyboard.press('Control+Shift+P'); await page.waitForTimeout(800);
await shot('06-palette');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
// quick open
await page.keyboard.press('Control+P'); await page.waitForTimeout(700);
await shot('07-quickopen');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
// shortcuts sheet
await page.keyboard.press('Control+/'); await page.waitForTimeout(800);
await shot('08-shortcuts');
await page.keyboard.press('Control+/'); await page.waitForTimeout(400);

// template modal via Options menu
try {
  await page.click('.nx-menu-trigger-btn:has-text("Options")'); await page.waitForTimeout(400);
  await page.click('.nx-titlebar-dropdown-item:has-text("C++ Template")'); await page.waitForTimeout(700);
  await shot('09-template-modal');
  await page.click('.nx-template-modal-btn.cancel'); await page.waitForTimeout(400);
} catch (e) { console.log('template modal fail', e.message); }
// snippets viewer via titlebar icon
try {
  await page.click('.nx-titlebar-snippets-btn'); await page.waitForTimeout(1200);
  await shot('10-snippets');
  const closeBtn = await page.$('.nx-editor-tab.active .nx-tab-close-btn');
  if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(500); }
} catch (e) { console.log('snippets fail', e.message); }

// settings
await page.keyboard.press('Control+,'); await page.waitForTimeout(900);
await shot('05-settings');

// themes
const themeIds = await page.evaluate(() => [...document.querySelectorAll('.sp-theme')].map(el => el.getAttribute('aria-pressed') !== null && el.textContent.trim().split(/[\n·]/)[0].trim()));
console.log('theme cards:', themeIds.length);
for (let i = 0; i < themeIds.length; i++) {
  const name = themeIds[i].replace(/\s+/g, '-').toLowerCase();
  if (onlyThemes && !onlyThemes.some(x => name.includes(x))) continue;
  const btn = (await page.$$('.sp-theme'))[i];
  await btn.click(); await page.waitForTimeout(1100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  await shot(`theme-${String(i).padStart(2,'0')}-${name}`);
  await page.keyboard.press('Control+,'); await page.waitForTimeout(600);
}
await browser.close();
console.log('done', dir);
