import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/workspace';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const THEMES = ['nexel','midnight','ember','sakura','mono','frost','forest','gold','aurora','dusk','light'];
for (const theme of THEMES) {
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await page.addInitScript((t) => { window.__NX_THEME = t; }, theme);
await page.addInitScript(() => {
  const contents = {
    'C:/ws/src/main.cpp': '#include <bits/stdc++.h>\n#include "utils.hpp"\nusing namespace std;\n\nstruct Point { long long x, y; };\n\nlong long cross(const Point& o, const Point& a, const Point& b) {\n    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);\n}\n\nvector<Point> hull(vector<Point> p) {\n    sort(p.begin(), p.end(), [](auto a, auto b) { return a.x < b.x || (a.x == b.x && a.y < b.y); });\n    vector<Point> h;\n    for (auto& pt : p) {\n        while (h.size() >= 2 && cross(h[h.size()-2], h.back(), pt) <= 0) h.pop_back();\n        h.push_back(pt);\n    }\n    return h;\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n; cin >> n;\n    vector<Point> p(n);\n    for (auto& [x, y] : p) cin >> x >> y;\n    auto h = hull(p);\n    cout << h.size() << "\\n";\n    return 0;\n}\n',
    'C:/ws/src/utils.hpp': '#pragma once\n#include <vector>\n\ntemplate <typename T>\nT mex(const std::vector<T>& v) {\n    std::vector<bool> seen(v.size() + 1);\n    for (auto& x : v) if (x <= (T)v.size()) seen[x] = true;\n    for (size_t i = 0;; ++i) if (!seen[i]) return i;\n}\n\nconstexpr long long MOD = 998244353;\n\nlong long qpow(long long a, long long e) {\n    long long r = 1;\n    while (e) { if (e & 1) r = r * a % MOD; a = a * a % MOD; e >>= 1; }\n    return r;\n}\n',
    'C:/ws/README.md': '# Geometry toolkit\n\nConvex hull (Andrew monotone chain) plus number-theoretic helpers.\n\n## Build\n\n```\nmake\n```\n',
    'C:/ws/Makefile': 'CXX = g++\nCXXFLAGS = -O2 -std=c++20 -Wall\n\nmain: src/main.cpp src/utils.hpp\n\t$(CXX) $(CXXFLAGS) -o main src/main.cpp\n',
  };
  const tree = [
    { name: 'src', path: 'C:/ws/src', type: 'folder', isOpen: true, children: [
      { name: 'main.cpp', path: 'C:/ws/src/main.cpp', type: 'file' },
      { name: 'utils.hpp', path: 'C:/ws/src/utils.hpp', type: 'file' },
    ]},
    { name: 'README.md', path: 'C:/ws/README.md', type: 'file' },
    { name: 'Makefile', path: 'C:/ws/Makefile', type: 'file' },
  ];
  const store = new Map();
  store.set('nexel-settings', JSON.stringify({ state: { theme: window.__NX_THEME }, version: 0 }));
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: 'C:/ws', rootName: 'WS', activeDir: 'C:/ws', searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/ws',
    readWorkspaceFiles: async (d) => d === 'C:/ws' ? tree : [],
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n,
    renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async (p) => contents[p] ?? '', writeFileContent: async () => true,
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
await page.click('text=src');
await page.waitForTimeout(500);
await page.click('text=main.cpp');
await page.waitForTimeout(1500);
const meta = await page.evaluate(() => {
  const r = getComputedStyle(document.documentElement);
  const sb = document.querySelector('.sb-bar');
  return { bg: r.getPropertyValue('--nx-bg-0').trim(), accent: r.getPropertyValue('--nx-acc').trim(), sb: sb ? getComputedStyle(sb).backgroundColor : '' };
});
console.log('THEME', theme, JSON.stringify(meta));
await page.screenshot({ path: dir + '/sweep-' + theme + '.png' });
await page.close();
}
await browser.close();
console.log('done');
