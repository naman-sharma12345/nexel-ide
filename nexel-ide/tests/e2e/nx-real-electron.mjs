// Real Electron lifecycle harness: real main process, real node-pty, real fs.
// Isolation: XDG_CONFIG_HOME points at a disposable temp dir; nothing touches
// the user's persistent ~/.config/Nexel IDE.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
const dir = '/tmp/nxshots/real';
fs.mkdirSync(dir, { recursive: true });
const ws = '/tmp/nxreal-ws';
// Fresh disposable fixture every run: leftovers from a previous run can never hide regressions.
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws + '/src', { recursive: true });
fs.writeFileSync(ws + '/src/main.py', 'def greet(name):\n    return f"hello, {name}"\n\nif __name__ == "__main__":\n    print(greet("nexel"))\n');
fs.writeFileSync(ws + '/src/main.cpp', '#include <iostream>\nint main() { std::cout << "hi\\n"; }\n');
fs.writeFileSync(ws + '/README.md', '# Real harness workspace\nPlain project, CP off by default.\n');
const cfg = fs.mkdtempSync('/tmp/nxe2e-config-');
const cfgSub = cfg + '/Nexel IDE';
fs.mkdirSync(cfgSub, { recursive: true });
fs.writeFileSync(cfgSub + '/config.json', JSON.stringify({
  'nexel-workspace-store': JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: ws, rootName: 'REALWS', activeDir: ws, searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }),
  'nexel-settings': JSON.stringify({ state: { theme: 'nexel' }, version: 0 }),
}));
console.log('CFG_ISOLATED', cfg, 'persistent config untouched:', fs.existsSync(os.homedir() + '/.config/Nexel IDE/config.json'));
const results = {};
function report(name, ok, extra = '') { results[name] = !!ok; console.log(name, ok ? 'OK' : 'FAIL', extra); }

async function boot() {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_START_URL: 'http://localhost:5199', XDG_CONFIG_HOME: cfg } });
  await new Promise(r => setTimeout(r, 5000));
  let page = null;
  for (const w of app.windows()) { if (!w.url().startsWith('devtools://')) { page = w; break; } }
  if (!page) page = await app.firstWindow();
  await page.waitForTimeout(1500);
  return { app, page };
}

// --- Phase 1: open file, edit, save, verify on disk (CP default OFF) ---
let { app, page } = await boot();
const cpOff = await page.evaluate(() => ({
  judgeNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Judge')),
  contestsNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Contests')),
  cpSnippetsBtn: [...document.querySelectorAll('button')].some((b) => (b.title ?? '').includes('CP Snippets')),
}));
report('CP_OFF_REAL', !cpOff.judgeNav && !cpOff.contestsNav && !cpOff.cpSnippetsBtn, JSON.stringify(cpOff));
// clangd must stay silent for a Python-only session: no missing-binary toast.
await page.waitForTimeout(6000);
const toastPy = await page.evaluate(() => [...document.querySelectorAll('.tz-toast')].map((t) => t.textContent));
report('CLANGD_QUIET_PYTHON', !toastPy.some((t) => (t ?? '').includes('clangd')), JSON.stringify(toastPy));
await page.locator('.nx-node-row:has-text("src")').first().click({ timeout: 15000 }); await page.waitForTimeout(700);
await page.locator('.nx-node-row:has-text("main.py")').first().click({ timeout: 15000 }); await page.waitForTimeout(1800);
await page.locator('.view-lines').first().click({ timeout: 15000 });
await page.keyboard.press('Control+End');
await page.keyboard.type("\nprint('edit-mark-123')");
await page.waitForTimeout(400);
const autoSave = await page.evaluate(() => (document.querySelector('.sb-bar')?.textContent ?? '').includes('Auto-Save'));
if (!autoSave) { await page.keyboard.press('Control+s'); }
await page.waitForTimeout(3000);
const disk = fs.readFileSync(ws + '/src/main.py', 'utf8');
const expected = 'def greet(name):\n    return f"hello, {name}"\n\nif __name__ == "__main__":\n    print(greet("nexel"))\n\nprint(\'edit-mark-123\')';
report('SAVE_DISK', disk === expected, 'autosave_was ' + autoSave + (disk === expected ? '' : ' ' + JSON.stringify(disk)));
await page.screenshot({ path: dir + '/r3-saved.png' });

// --- Phase 1c: theme switch through the real settings UI ---
await page.keyboard.press('Control+,');
await page.waitForTimeout(1200);
await page.locator('button.sp-theme:has-text("Midnight Indigo")').first().click({ timeout: 10000 });
await page.waitForTimeout(1200);
const themeNow = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
report('THEME_SWITCH_REAL', themeNow === 'midnight', String(themeNow));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await app.close();
await new Promise(r => setTimeout(r, 1500));

// --- Phase 2: reopen in a fresh process, verify persistence ---
({ app, page } = await boot());
await page.waitForTimeout(2500);
const restoredTabs = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('SESSION_RESTORE_REAL', restoredTabs.includes('main.py'), JSON.stringify(restoredTabs));
await page.locator('.nx-node-row:has-text("src")').first().click({ timeout: 15000 }); await page.waitForTimeout(700);
await page.locator('.nx-node-row:has-text("main.py")').first().click({ timeout: 15000 }); await page.waitForTimeout(1800);
const reopened = await page.evaluate(() => document.querySelector('.view-lines')?.textContent ?? '');
report('REOPEN_PERSIST', reopened.includes('edit-mark-123'));
const themePersisted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
report('THEME_PERSIST_REAL', themePersisted === 'midnight', String(themePersisted));

// --- Phase 2b: find-in-files over the real fs ---
await page.keyboard.press('Control+Shift+f');
await page.waitForTimeout(900);
await page.locator('input.sf-input[placeholder="Find in files…"]').fill('greet');
await page.waitForTimeout(1800);
const search = await page.evaluate(() => ({
  files: [...document.querySelectorAll('.sf-file span')].map((x) => x.textContent),
  hits: document.querySelectorAll('.sf-hit').length,
}));
const searchOk = search.files.includes('main.py') && search.hits >= 2;
report('SEARCH_REAL', searchOk, JSON.stringify(search));
if (searchOk) {
  await page.locator('.sf-hit').first().click();
  await page.waitForTimeout(1200);
  const openedTab = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? '');
  report('SEARCH_OPEN_REAL', openedTab === 'main.py', 'tab=' + openedTab);
}
await page.screenshot({ path: dir + '/r9-search.png' });

// --- Phase 3: real PTY terminal lifecycle ---
await page.click('.sb-bar >> text=Terminal');
await page.waitForTimeout(3500);
const termArea = page.locator('.nx-terminal-panel .xterm, .nx-terminal-panel').first();
await termArea.click().catch(() => {});
await page.keyboard.type('echo NX$((20+22))');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const termText = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
report('TERM_PTY', termText.includes('NX42'), JSON.stringify(termText.slice(-120)));
await page.screenshot({ path: dir + '/r4-terminal.png' });

// --- Phase 3b: opening a real C++ file still surfaces the missing-clangd notice ---
await page.locator('.nx-node-row:has-text("main.cpp")').first().click({ timeout: 15000 });
await page.waitForTimeout(3500);
const cppEvidence = await page.evaluate(() => ({
  toasts: [...document.querySelectorAll('.tz-toast')].map((t) => t.textContent),
  sb: document.querySelector('.sb-bar')?.textContent ?? '',
}));
const toastHit = cppEvidence.toasts.some((t) => (t ?? '').includes('clangd not found'));
const chipHit = cppEvidence.sb.includes('clangd');
report('CLANGD_NOTICE_CPP', toastHit && chipHit, JSON.stringify(cppEvidence));
await page.screenshot({ path: dir + '/r6-cpp-notice.png' });

// --- Phase 3c: real file creation through the explorer header ---
await page.locator('button.nx-action-btn[title="New File"]').first().click({ timeout: 15000 });
await page.waitForTimeout(800);
await page.locator('.nx-inline-input-wrapper input').first().fill('notes.txt');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const createdRow = await page.evaluate(() => [...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('notes.txt')));
const createdDisk = fs.existsSync(ws + '/src/notes.txt') && fs.readFileSync(ws + '/src/notes.txt', 'utf8') === '';
report('CREATE_FILE_REAL', createdRow && createdDisk, 'row=' + createdRow + ' disk=' + createdDisk);
await page.screenshot({ path: dir + '/r7-created.png' });

// --- Phase 3d: real rename + delete through the context menu ---
await page.locator('.nx-node-row:has-text("notes.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Rename")').first().click({ timeout: 10000 });
await page.waitForTimeout(600);
await page.locator('.nx-inline-input-wrapper input').first().fill('todo.txt');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const renamedOk = fs.existsSync(ws + '/src/todo.txt') && !fs.existsSync(ws + '/src/notes.txt');
const renamedRow = await page.evaluate(() => [...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('todo.txt')));
report('RENAME_REAL', renamedOk && renamedRow, 'disk=' + renamedOk + ' row=' + renamedRow);

page.on('dialog', (d) => d.accept());
await page.locator('.nx-node-row:has-text("todo.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click({ timeout: 10000 });
await page.waitForTimeout(1200);
const deletedOk = !fs.existsSync(ws + '/src/todo.txt');
const deletedRow = await page.evaluate(() => ![...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('todo.txt')));
report('DELETE_REAL', deletedOk && deletedRow, 'disk=' + deletedOk + ' row=' + deletedRow);

await app.close();

// --- Phase 4: CP explicitly enabled -> surfaces appear ---
fs.writeFileSync(cfgSub + '/config.json', JSON.stringify({
  'nexel-workspace-store': JSON.stringify({ state: { recentWorkspaces: [], pinnedPaths: [], rootPath: ws, rootName: 'REALWS', activeDir: ws, searchQuery: '', isRegex: false, isMatchCase: false }, version: 0 }),
  'nexel-settings': JSON.stringify({ state: { theme: 'nexel', plugins: { 'competitive-programming': true } }, version: 0 }),
}));
({ app, page } = await boot());
await page.waitForTimeout(1500);
const cpOn = await page.evaluate(() => ({
  judgeNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Judge')),
  contestsNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Contests')),
}));
report('CP_ON_REAL', cpOn.judgeNav && cpOn.contestsNav, JSON.stringify(cpOn));
await page.screenshot({ path: dir + '/r5-cp-on.png' });
await app.close();
const EXPECTED = ['CP_OFF_REAL','CLANGD_QUIET_PYTHON','SAVE_DISK','THEME_SWITCH_REAL','SESSION_RESTORE_REAL','REOPEN_PERSIST','THEME_PERSIST_REAL','SEARCH_REAL','SEARCH_OPEN_REAL','TERM_PTY','CLANGD_NOTICE_CPP','CREATE_FILE_REAL','RENAME_REAL','DELETE_REAL','CP_ON_REAL'];
const missing = EXPECTED.filter((n) => !(n in results));
const failed = EXPECTED.filter((n) => results[n] === false);
console.log('SUMMARY', JSON.stringify({ ok: EXPECTED.length - missing.length - failed.length, total: EXPECTED.length, missing, failed }));
if (missing.length || failed.length) { console.log('done WITH FAILURES'); process.exit(1); }
console.log('done');
