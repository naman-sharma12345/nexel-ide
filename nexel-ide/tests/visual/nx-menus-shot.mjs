import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/tmp/nxshots/workspace';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
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
await page.waitForTimeout(2200);
await page.click('text=src'); await page.waitForTimeout(400);
await page.click('text=main.cpp'); await page.waitForTimeout(1200);
const probe = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { bf: cs.backdropFilter, bs: cs.boxShadow.slice(0, 90), bg: cs.background.slice(0, 60), opacity: cs.opacity, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, visible: r.width > 0 && r.height > 0 };
}, sel);

// 1. NavDock tooltip on hover
await page.hover('.nd-item-row >> nth=0');
await page.waitForTimeout(1600);
console.log('TOOLTIP', JSON.stringify(await probe('.nd-tooltip')));
await page.screenshot({ path: dir + '/m1-tooltip.png', clip: { x: 0, y: 0, width: 640, height: 640 } });
await page.mouse.move(700, 450); await page.waitForTimeout(400);

// 2. Titlebar File menu
await page.click('.nx-menu-trigger-btn:has-text(\'File\')');
await page.waitForTimeout(900);
console.log('FILEMENU', JSON.stringify(await probe('.nx-titlebar-dropdown')));
await page.screenshot({ path: dir + '/m2-filemenu.png', clip: { x: 0, y: 0, width: 900, height: 700 } });
await page.keyboard.press('Escape'); await page.mouse.move(700, 450); await page.mouse.click(700, 450); await page.waitForTimeout(400);

// 3. Tab actions dropdown
await page.click('.nx-tab-menu-btn');
await page.waitForTimeout(500);
console.log('TABMENU', JSON.stringify(await probe('.nx-tab-dropdown-menu')));
await page.screenshot({ path: dir + '/m3-tabmenu.png', clip: { x: 700, y: 0, width: 656, height: 400 } });
// 4. Status-bar clangd menu
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('.sb-lsp');
await page.waitForTimeout(600);
console.log('SBMENU', JSON.stringify(await probe('.sb-menu')));
await page.screenshot({ path: dir + '/m4-sbmenu.png', clip: { x: 0, y: 600, width: 1440, height: 300 } });
await browser.close();
console.log('done');
