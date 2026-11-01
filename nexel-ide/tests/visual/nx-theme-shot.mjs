import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/themes';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const THEMES = ['light', 'midnight', 'mono', 'ember'];
for (const theme of THEMES) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await page.addInitScript((themeId) => {
    const files = [{ name: 'solve.cpp', type: 'file' }];
    const store = new Map();
    store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
    store.set('nexel-settings', JSON.stringify({ state: { theme: themeId, fontSize: 13, minimap: false, ligatures: true, wordWrap: false, tabSize: 2, clangdEnabled: true, cppStd: 'c++17', clangdFlags: '' }, version: 0 }));
    window.nexelAPI = {
      minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
      openWorkspaceDir: async () => 'C:/ws',
      readWorkspaceFiles: async (d) => files.map(f => ({ name: f.name, path: d + '/' + f.name, type: f.type, ...(f.type === 'folder' ? { isOpen: false, children: [] } : {}) })),
      createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
      renameNode: async (o, n) => n, deleteNode: async () => true,
      readFileContent: async () => '#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int n; cin>>n; cout<<n*2<<"\\n"; }\n', writeFileContent: async () => true,
      createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
      runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }), fetchContestProblems: async () => ({}),
      onCompanionProblem() {},
      getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
      lspStart: async () => ({ ok: false }), lspStop: async () => true, lspRestart: async () => true,
      onLspMessage: () => {}, onLspStatus: () => {}, lspSend: async () => true,
    };
  }, theme);
  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/th-${theme}-welcome.png` });
  await page.click('.nx-node-name:has-text("solve.cpp")').catch(async () => { await page.click('text=solve.cpp'); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${dir}/th-${theme}-editor.png` });
  await page.close();
  console.log(theme, 'done');
}
await browser.close();
console.log('done');
