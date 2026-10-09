// Visual check for clangd IntelliSense: mocks window.nexelAPI (including the lsp bridge with a scripted clangd)
// against `npx vite preview --port 4190`, then captures the status chip, completion, hover, diagnostics and Paper Light.
//   node tests/visual/clangd-shots.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = process.argv[2] || 'shots-clangd';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.addInitScript(() => {
  const code = [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main() {',
    '    ios::sync_with_stdio(false);',
    '    cin.tie(nullptr);',
    '    int n; cin >> n;',
    '    vector<int> v(n);',
    '    for (auto &x : v) cin >> x;',
    '    sort(v.begin(), v.end());',
    '    long long best = answer + v.back();',
    '    v.',
    '    cout << best << "\\n";',
    '    return 0;',
    '}',
    '',
  ].join('\n');
  const store = new Map();
  let onMsg = () => {}; let onStatus = () => {};
  const reply = (id, result) => setTimeout(() => onMsg({ jsonrpc: '2.0', id, result }), 30);
  const members = [
    ['push_back', '(const int &x)', 'void', 'Appends the given element value to the end of the container.'],
    ['pop_back', '()', 'void', 'Removes the last element of the container.'],
    ['emplace_back', '(Args &&args...)', 'int &', 'Constructs an element in-place at the end.'],
    ['size', '()', 'size_type', 'Returns the number of elements in the container.'],
    ['empty', '()', 'bool', 'Checks whether the container is empty.'],
    ['begin', '()', 'iterator', 'Returns an iterator to the first element.'],
    ['end', '()', 'iterator', 'Returns an iterator past the last element.'],
    ['back', '()', 'reference', 'Returns a reference to the last element.'],
    ['front', '()', 'reference', 'Returns a reference to the first element.'],
    ['clear', '()', 'void', 'Erases all elements from the container.'],
    ['resize', '(size_type n)', 'void', 'Resizes the container to contain n elements.'],
    ['reserve', '(size_type n)', 'void', 'Increases the capacity to at least n.'],
    ['insert', '(const_iterator pos, const int &x)', 'iterator', 'Inserts elements at the specified location.'],
    ['erase', '(const_iterator pos)', 'iterator', 'Erases the specified elements.'],
  ];
  let docUri = '';
  const publish = () => setTimeout(() => onMsg({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: docUri.replace('c%3A', 'C:'), version: 1, diagnostics: [
    { range: { start: { line: 10, character: 21 }, end: { line: 10, character: 27 } }, severity: 1, code: 'undeclared_var_use', source: 'clang', message: "Use of undeclared identifier 'answer'" },
    { range: { start: { line: 11, character: 6 }, end: { line: 11, character: 6 } }, severity: 1, code: 'expected_unqualified_id', source: 'clang', message: 'Expected unqualified-id' },
    { range: { start: { line: 6, character: 8 }, end: { line: 6, character: 9 } }, severity: 2, code: '-Wshadow', source: 'clang', message: "Declaration shadows a local variable (fix available)" },
  ] } }), 120);
  window.__lspLog = [];
  const lsp = {
    lspStart: async () => { setTimeout(() => onStatus('starting'), 5); return { ok: true, source: 'bundled', compiler: 'g++.exe', config: 'written' }; },
    lspStop: async () => true, lspRestart: async () => { setTimeout(() => onStatus('starting'), 50); return true; },
    onLspMessage: (cb) => { onMsg = cb; }, onLspStatus: (cb) => { onStatus = cb; },
    lspSend: async (m) => {
      window.__lspLog.push(m.method || 'response');
      if (m.method === 'initialize') reply(m.id, { capabilities: { textDocumentSync: { openClose: true, change: 2, save: true }, completionProvider: { triggerCharacters: ['.', '<', '>', ':', '"', '/', '*'], resolveProvider: false }, hoverProvider: true, signatureHelpProvider: { triggerCharacters: ['(', ',', ')', '<', '>', '{'] }, definitionProvider: true, renameProvider: { prepareProvider: true } }, serverInfo: { name: 'clangd', version: '19.1.2 (https://github.com/llvm/llvm-project 7ba7d8e2)' } });
      else if (m.method === 'textDocument/didOpen') { docUri = m.params.textDocument.uri; publish();
        setTimeout(() => onMsg({ jsonrpc: '2.0', method: 'textDocument/clangd.fileStatus', params: { uri: docUri, state: 'parsing includes' } }), 10);
        setTimeout(() => onMsg({ jsonrpc: '2.0', method: 'textDocument/clangd.fileStatus', params: { uri: docUri, state: 'idle' } }), window.__holdIndexing ? 600000 : 700); }
      else if (m.method === 'textDocument/didChange') publish();
      else if (m.method === 'textDocument/completion') {
        const { line, character } = m.params.position;
        const items = members.map(([name, sig, ret, doc], i) => ({
          label: ' ' + name, labelDetails: { detail: sig }, detail: ret, kind: 2, sortText: String(i).padStart(3, '0') + name, filterText: name, insertTextFormat: 2,
          textEdit: { range: { start: { line, character: 6 }, end: { line, character } }, newText: name + (sig === '()' ? '()' : '(${1})') },
          documentation: { kind: 'markdown', value: doc },
        }));
        reply(m.id, { isIncomplete: false, items });
      } else if (m.method === 'textDocument/hover') {
        if (m.params.position.line !== 7) { reply(m.id, null); return true; }
        reply(m.id, { contents: { kind: 'markdown', value: '### variable `v`\n\n---\nType: `vector<int>` (aka `std::vector<int, std::allocator<int>>`)\n\n---\n```cpp\n// In main\nvector<int> v(n)\n```' } });
      } else if (m.method === 'textDocument/signatureHelp') reply(m.id, null);
      else if (m.method === 'textDocument/documentHighlight') reply(m.id, []);
      else if (m.id !== undefined) reply(m.id, null);
      return true;
    },
  };
  store.set('nexel-workspace-store', JSON.stringify({ state: { recentWorkspaces: ['C:/cp-workspace'], pinnedPaths: [], rootPath: null, rootName: '', activeDir: null, searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }));
  window.nexelAPI = {
    minimizeWindow() {}, maximizeWindow() {}, closeWindow() {},
    openWorkspaceDir: async () => 'C:/cp-workspace',
    readWorkspaceFiles: async (d) => [{ name: 'main.cpp', path: d + '/main.cpp', type: 'file' }, { name: 'input.txt', path: d + '/input.txt', type: 'file' }],
    createFile: async (p, n) => p + '/' + n, createFolder: async (p, n) => p + '/' + n, renameNode: async (o, n) => n, deleteNode: async () => true,
    readFileContent: async () => code, writeFileContent: async () => true,
    createTerminal: async () => true, writeTerminal() {}, resizeTerminal() {}, onTerminalData() {},
    runJudge: async () => [], fetchContests: async () => ({ active: [], upcoming: [], passed: [] }), fetchContestProblems: async () => ({}),
    onCompanionProblem() {},
    getStoreSync: (k) => store.get(k), setStoreSync: (k, v) => store.set(k, v), deleteStoreSync: (k) => store.delete(k),
    ...lsp,
  };
});

async function open() {
  await page.goto('http://localhost:4190/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  for (const sel of ['text=Open Folder', 'text=Open Workspace', 'text=OPEN FOLDER']) { const el = await page.$(sel); if (el) { await el.click().catch(() => {}); break; } }
  await page.waitForTimeout(700);
  await page.click('text=main.cpp');
  await page.waitForSelector('.monaco-editor .view-lines');
  await page.waitForTimeout(1600);
}
/** Bounding box of `token` on the editor line containing `lineText`. */
async function tokenBox(lineText, token, nth = 0) {
  return page.evaluate(([lineText, token, nth]) => {
    const norm = (l) => l.textContent.replace(/\u00a0/g, ' ');
    const all = [...document.querySelectorAll('.monaco-editor .view-line')];
    const line = all.find(l => norm(l).trim() === lineText.trim()) ?? all.find(l => norm(l).includes(lineText));
    if (!line) return null;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); let n, seen = 0;
    while ((n = walker.nextNode())) {
      const t = n.textContent.replace(/\u00a0/g, ' '); let i = -1;
      while ((i = t.indexOf(token, i + 1)) >= 0) { if (seen++ === nth) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + token.length); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } }
    }
    return null;
  }, [lineText, token, nth]);
}
const clip = (b, pad = {}) => ({ x: Math.max(0, b.x - (pad.l ?? 20)), y: Math.max(0, b.y - (pad.t ?? 20)), width: b.w + (pad.l ?? 20) + (pad.r ?? 20), height: b.h + (pad.t ?? 20) + (pad.b ?? 20) });

async function suite(tag) {
  // status chip (ready) + its menu
  const chip = await page.$('.sb-lsp'); const cb = await chip.boundingBox();
  await page.screenshot({ path: `${dir}/${tag}-status-chip.png`, clip: { x: cb.x - 260, y: cb.y - 10, width: cb.width + 520, height: cb.height + 20 } });
  await chip.click(); await page.waitForTimeout(350);
  const menu = await (await page.$('.sb-menu')).boundingBox();
  await page.screenshot({ path: `${dir}/${tag}-status-menu.png`, clip: { x: menu.x - 30, y: menu.y - 20, width: menu.width + 60, height: menu.height + cb.height + 40 } });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);

  // diagnostics squiggles + marker hover
  const ans = await tokenBox('best = answer', 'answer');
  await page.mouse.move(ans.x + ans.w / 2, ans.y + ans.h / 2); await page.waitForTimeout(1400);
  const hov = await page.$('.monaco-hover:not(.hidden)'); const hb = hov ? await hov.boundingBox() : null;
  const edBox = await (await page.$('.monaco-editor')).boundingBox();
  await page.screenshot({ path: `${dir}/${tag}-diagnostics.png`, clip: { x: edBox.x, y: Math.max(0, (hb ? Math.min(hb.y, ans.y) : ans.y) - 40), width: Math.min(900, edBox.width), height: (hb ? Math.max(hb.y + hb.height, ans.y + ans.h) - Math.min(hb.y, ans.y) : 60) + 140 } });
  await page.mouse.move(edBox.x + edBox.width - 40, edBox.y + edBox.height - 40); await page.waitForTimeout(500);

  // hover card on `v`
  const vb = await tokenBox('vector<int> v(n)', ' v', 0);
  await page.mouse.move(vb.x + vb.w * 0.75, vb.y + vb.h / 2); await page.waitForTimeout(1500);
  const h2 = await page.$('.monaco-hover:not(.hidden)'); const h2b = h2 ? await h2.boundingBox() : vb && { x: vb.x, y: vb.y, width: 300, height: 100 };
  const top = Math.min(h2b.y, vb.y) - 30;
  await page.screenshot({ path: `${dir}/${tag}-hover.png`, clip: { x: Math.max(edBox.x, Math.min(h2b.x, vb.x) - 40), y: Math.max(0, top), width: Math.max(h2b.width, 420) + 80, height: Math.max(h2b.y + h2b.height, vb.y + vb.h) - top + 30 } });
  await page.mouse.move(edBox.x + edBox.width - 40, edBox.y + edBox.height - 40); await page.waitForTimeout(500);

  // completion after `v.`
  const dot = await tokenBox('v.', 'v', 0);
  const lines = await page.$$eval('.monaco-editor .view-line', ls => ls.length);
  await page.mouse.click(dot.x + dot.w + 30, dot.y + dot.h / 2); await page.waitForTimeout(200);
  await page.keyboard.press('End'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+Space'); await page.waitForTimeout(900);
  // expand the details side panel (Ctrl+Space again toggles it)
  await page.keyboard.press('Control+Space'); await page.waitForTimeout(700);
  const sw = await page.$('.suggest-widget.visible'); const sb = sw ? await sw.boundingBox() : null;
  const det = await page.$('.suggest-details-container'); const db = det ? await det.boundingBox() : null;
  if (sb) {
    const right = Math.max(sb.x + sb.width, db && db.width > 10 ? db.x + db.width : 0);
    await page.screenshot({ path: `${dir}/${tag}-completion.png`, clip: { x: Math.max(0, dot.x - 120), y: Math.max(0, dot.y - 60), width: right - dot.x + 160, height: sb.y + sb.height - dot.y + 90 } });
  } else console.log('no suggest widget', lines);
  await page.screenshot({ path: `${dir}/${tag}-full.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
}

await open();
console.log('lsp traffic:', JSON.stringify((await page.evaluate(() => window.__lspLog)).slice(0, 8)));
console.log('chip:', await page.$eval('.sb-lsp', el => el.textContent + ' / ' + el.dataset.status));
await suite('dark');

// Settings IntelliSense section
await page.keyboard.press('Control+,'); await page.waitForTimeout(800);
await page.$eval('#sp-intellisense', el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400);
const sec = await (await page.$('#sp-intellisense')).boundingBox();
await page.screenshot({ path: `${dir}/dark-settings-intellisense.png`, clip: { x: sec.x - 24, y: sec.y - 16, width: sec.width + 48, height: sec.height + 32 } });
// Paper Light
const themes = await page.$$('.sp-theme');
for (const t of themes) { if ((await t.textContent()).includes('Paper Light')) { await t.click(); break; } }
await page.waitForTimeout(1200);
await page.$eval('#sp-intellisense', el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
const sec2 = await (await page.$('#sp-intellisense')).boundingBox();
await page.screenshot({ path: `${dir}/light-settings-intellisense.png`, clip: { x: sec2.x - 24, y: sec2.y - 16, width: sec2.width + 48, height: sec2.height + 32 } });
await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await suite('light');

await browser.close();
console.log('done', dir);
