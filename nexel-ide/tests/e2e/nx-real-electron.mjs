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
fs.writeFileSync(ws + '/src/probe-hit1.txt', 'alpha PROBETOKEN one\nPROBETOKEN two\n');
fs.writeFileSync(ws + '/src/probe-hit2.txt', 'three PROBETOKEN\n');
fs.writeFileSync(ws + '/src/probe-save.txt', 'save probe\n');
fs.writeFileSync(ws + '/src/probe-ro.txt', 'readonly probe\n');
fs.writeFileSync(ws + '/src/probe-p1.txt', 'partial one\n');
fs.writeFileSync(ws + '/src/probe-p2.txt', 'partial two\n');
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

// Bounded cleanup: only Electron processes this suite itself spawned - never global kills.
import { execSync } from 'node:child_process';
const spawnedPids = [];
function cleanupOwned() {
  for (const pid of spawnedPids) {
    try { execSync(`pkill -9 -P ${pid} 2>/dev/null`); } catch { /* children already gone */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ }
  }
}
process.on('exit', cleanupOwned);

let pageErrors = [];
const BAD_ERROR = /PAGEERROR|Transform failed|Cannot find module|Failed to fetch|Uncaught|ReferenceError|TypeError|SyntaxError/i;
async function boot(url = 'http://localhost:5199') {
  pageErrors = [];
  const wire = (w) => {
    if (w.url().startsWith('devtools://')) return;
    w.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });
    w.on('pageerror', (e) => pageErrors.push('PAGEERROR@' + ((performance.now() / 1000).toFixed(1)) + 's ' + String(e.stack || e).slice(0, 600)));
  };
  const app = await electron.launch({ args: ['.'], env: { ...process.env, ELECTRON_START_URL: url, XDG_CONFIG_HOME: cfg } });
  const appPid = app.process()?.pid;
  if (appPid) spawnedPids.push(appPid);
  app.on('window', wire);
  await new Promise(r => setTimeout(r, 3500));
  let page = null;
  for (const w of app.windows()) { if (!w.url().startsWith('devtools://')) { page = w; break; } }
  if (!page) page = await app.firstWindow();
  wire(page);
  await page.waitForTimeout(1000);
  return { app, page };
}
// Positive proof the renderer came up: absence-style phases are meaningless on a blank page.
const bootProbe = (pg) => pg.evaluate(() => ({
  explorer: !!document.querySelector('.nx-explorer-wrapper'),
  rows: document.querySelectorAll('.nx-node-row').length,
  nav: document.querySelectorAll('.nd-item-row').length,
}));

// --- Phase 1: open file, edit, save, verify on disk (CP default OFF) ---
let { app, page } = await boot();
// Gate: positive boot proof + no module/renderer errors before any absence-based assertion runs.
await page.locator('.nx-node-row').first().waitFor({ state: 'visible', timeout: 30000 });
const ready = await bootProbe(page);
await page.waitForTimeout(1200);
const bootBad = pageErrors.filter((e) => BAD_ERROR.test(e));
report('BOOT_READY_REAL', ready.explorer && ready.rows > 0 && ready.nav > 0 && bootBad.length === 0, JSON.stringify({ ready, bootBad: bootBad.slice(0, 3) }));
const cpOff = await page.evaluate(() => ({
  judgeNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Judge')),
  contestsNav: [...document.querySelectorAll('.nd-item-row')].some((r) => r.textContent?.includes('Contests')),
  judgeChip: !!document.querySelector('.sb-judge'),
  snippetsBtn: !!document.querySelector('.nx-titlebar-snippets-btn'),
  snippetsToggle: !!document.querySelector('.nx-titlebar-toggle-wrapper'),
}));
report('CP_OFF_REAL', !cpOff.judgeNav && !cpOff.contestsNav && !cpOff.judgeChip && !cpOff.snippetsBtn && !cpOff.snippetsToggle, JSON.stringify(cpOff));
// clangd must stay silent for a Python-only session: no missing-binary toast.
await page.waitForTimeout(4500);
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
await page.waitForTimeout(800);
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

// --- Phase 2b2: replace-all inline confirm, disk-verified ---
const rcHit1 = ws + '/src/probe-hit1.txt';
const rcHit2 = ws + '/src/probe-hit2.txt';
const rcOrig1 = fs.readFileSync(rcHit1, 'utf8');
const rcOrig2 = fs.readFileSync(rcHit2, 'utf8');
const rcReadme = fs.readFileSync(ws + '/README.md', 'utf8');
const rcDisk = () => ({ h1: fs.readFileSync(rcHit1, 'utf8'), h2: fs.readFileSync(rcHit2, 'utf8'), rm: fs.readFileSync(ws + '/README.md', 'utf8') });
const rcUnchanged = (d) => d.h1 === rcOrig1 && d.h2 === rcOrig2 && d.rm === rcReadme;
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.keyboard.press('Control+Shift+f');
await page.waitForTimeout(700);
await page.locator('input.sf-input[placeholder="Find in files…"]').fill('PROBETOKEN');
await page.waitForTimeout(1500);
await page.locator('input.sf-input[placeholder="Replace with…"]').fill('REPLACED');
await page.locator('button.sf-repbtn').click();
await page.waitForTimeout(400);
const rcRow = await page.evaluate(() => document.querySelector('.sf-confirm')?.textContent ?? '');
await page.screenshot({ path: dir + '/r12-replace-confirm.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const rcAfterEsc = { row: await page.evaluate(() => !!document.querySelector('.sf-confirm')), ...rcDisk() };
await page.locator('button.sf-repbtn').click();
await page.waitForTimeout(300);
await page.locator('button.sf-cf-no').click();
await page.waitForTimeout(300);
const rcAfterCancel = { row: await page.evaluate(() => !!document.querySelector('.sf-confirm')), ...rcDisk() };
await page.locator('button.sf-repbtn').click();
await page.waitForTimeout(400);
const rcAfterOpen = rcDisk();
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const rcAfterEnter = rcDisk();
const rcExp1 = rcOrig1.split('PROBETOKEN').join('REPLACED');
const rcExp2 = rcOrig2.split('PROBETOKEN').join('REPLACED');
const rc = {
  row: rcRow.includes('3') && rcRow.includes('2'),
  escapeCancelled: !rcAfterEsc.row && rcUnchanged(rcAfterEsc),
  cancelCancelled: !rcAfterCancel.row && rcUnchanged(rcAfterCancel),
  noAccidentalApply: rcUnchanged(rcAfterOpen),
  enterApplied: rcAfterEnter.h1 === rcExp1 && rcAfterEnter.h2 === rcExp2 && rcAfterEnter.rm === rcReadme,
};
fs.unlinkSync(rcHit1);
fs.unlinkSync(rcHit2);
report('REPLACE_CONFIRM_REAL', Object.values(rc).every(Boolean), JSON.stringify(rc));
await page.locator('input.sf-input[placeholder="Find in files…"]').press('Escape');
await page.waitForTimeout(300);

// --- Phase 2b3: dirty-close dialog - focus safety, save path, write-failure + partial-failure preservation ---
if (!await page.locator('.nx-node-row:has-text("probe-save.txt")').count()) {
  await page.locator('.nx-node-row:has-text("src")').first().click(); await page.waitForTimeout(600);
}
await page.locator('.nx-node-row:has-text("probe-save.txt")').first().click(); await page.waitForTimeout(1000);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('SAVEMARK'); await page.waitForTimeout(300);
await page.locator('.nx-editor-tab:has-text("probe-save.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(500);
const svFocus = await page.evaluate(() => ({
  box: !!document.querySelector('.nx-cf-box'),
  msg: document.querySelector('.nx-cf-msg')?.textContent ?? '',
  focused: document.activeElement?.className ?? '',
  diskUntouched: true,
}));
const svDiskEarly = fs.readFileSync(ws + '/src/probe-save.txt', 'utf8');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
const contained = await page.evaluate(() => !!document.querySelector('.nx-cf-box')?.contains(document.activeElement));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
const afterEscDlg = await page.evaluate(() => ({
  gone: !document.querySelector('.nx-cf-box'),
  tabOpen: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].some(x => x.textContent === 'probe-save.txt'),
  dirty: !!document.querySelector('.nx-editor-tab .nx-dirty-indicator-glow'),
}));
const diskAfterEsc = fs.readFileSync(ws + '/src/probe-save.txt', 'utf8');
await page.locator('.nx-editor-tab:has-text("probe-save.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(900);
const svDisk = fs.readFileSync(ws + '/src/probe-save.txt', 'utf8');
const svTabGone = await page.evaluate(() => ![...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].some(x => x.textContent === 'probe-save.txt'));
// write-failure: path replaced by a directory so the write really fails (EISDIR)
await page.locator('.nx-node-row:has-text("probe-ro.txt")').first().click(); await page.waitForTimeout(1000);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('ROMARK'); await page.waitForTimeout(300);
fs.unlinkSync(ws + '/src/probe-ro.txt'); fs.mkdirSync(ws + '/src/probe-ro.txt');
await page.locator('.nx-editor-tab:has-text("probe-ro.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-cf-save').click(); await page.waitForTimeout(1000);
const roAfter = await page.evaluate(() => ({
  err: document.querySelector('.nx-cf-error')?.textContent ?? '',
  dlgOpen: !!document.querySelector('.nx-cf-box'),
  tabOpen: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].some(x => x.textContent === 'probe-ro.txt'),
  dirty: !!document.querySelector('.nx-editor-tab .nx-dirty-indicator-glow'),
  buf: (document.querySelector('.view-lines')?.textContent ?? '').includes('ROMARK'),
}));
fs.rmdirSync(ws + '/src/probe-ro.txt'); fs.writeFileSync(ws + '/src/probe-ro.txt', 'readonly probe\n');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.locator('.nx-editor-tab:has-text("probe-ro.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(500);
// partial failure: two dirty targets, second write fails - first must land on disk, second must survive
await page.locator('.nx-node-row:has-text("probe-p1.txt")').first().click(); await page.waitForTimeout(1000);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('P1MARK'); await page.waitForTimeout(250);
await page.locator('.nx-node-row:has-text("probe-p2.txt")').first().click(); await page.waitForTimeout(1000);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('P2MARK'); await page.waitForTimeout(250);
fs.unlinkSync(ws + '/src/probe-p2.txt'); fs.mkdirSync(ws + '/src/probe-p2.txt');
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close All Tabs' }).first().click(); await page.waitForTimeout(600);
await page.locator('.nx-cf-save').click(); await page.waitForTimeout(1000);
const part = await page.evaluate(() => ({
  dlgOpen: !!document.querySelector('.nx-cf-box'),
  err: document.querySelector('.nx-cf-error')?.textContent ?? '',
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map(x => x.textContent),
  dirtyCount: document.querySelectorAll('.nx-editor-tab .nx-dirty-indicator-glow').length,
}));
const p1Disk = fs.readFileSync(ws + '/src/probe-p1.txt', 'utf8');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
fs.rmdirSync(ws + '/src/probe-p2.txt'); fs.writeFileSync(ws + '/src/probe-p2.txt', 'partial two\n');
await page.locator('.nx-editor-tab:has-text("probe-p2.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(500);
await page.locator('.nx-editor-tab:has-text("probe-p1.txt") .nx-tab-close-btn').first().click(); await page.waitForTimeout(500);
fs.unlinkSync(ws + '/src/probe-save.txt'); fs.unlinkSync(ws + '/src/probe-ro.txt');
fs.unlinkSync(ws + '/src/probe-p1.txt'); fs.unlinkSync(ws + '/src/probe-p2.txt');
const sv = {
  dlgShown: svFocus.box && svFocus.msg.includes('probe-save.txt'),
  defaultFocusSave: svFocus.focused.includes('nx-cf-save'),
  noAccidentalApply: !svDiskEarly.includes('SAVEMARK'),
  focusContained: contained,
  escapeCancels: afterEscDlg.gone && afterEscDlg.tabOpen && afterEscDlg.dirty && !diskAfterEsc.includes('SAVEMARK'),
  enterSaves: svDisk.includes('SAVEMARK') && svTabGone,
  failKept: roAfter.dlgOpen && roAfter.err.includes('Could not save') && roAfter.err.includes('probe-ro.txt') && roAfter.tabOpen && roAfter.dirty && roAfter.buf,
  partial: part.dlgOpen && part.err.includes('probe-p2.txt') && p1Disk.includes('P1MARK') && part.tabs.includes('probe-p1.txt') && part.tabs.includes('probe-p2.txt') && part.dirtyCount === 1,
};
report('TABS_DIRTY_SAVE_REAL', Object.values(sv).every(Boolean), JSON.stringify(sv));

// --- Phase 2c: quick open (Ctrl+P) over the real file tree ---
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.keyboard.press('Control+p');
await page.waitForTimeout(800);
await page.keyboard.type('readme');
await page.waitForTimeout(600);
const qo = await page.evaluate(() => [...document.querySelectorAll('.cp-item')].map((x) => x.textContent ?? ''));
const qoListed = qo.some((t) => t.includes('README.md'));
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const qoTab = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? '');
report('QUICKOPEN_REAL', qoListed && qoTab === 'README.md', JSON.stringify({ listed: qoListed, items: qo.length, tab: qoTab }));
await page.screenshot({ path: dir + '/r10-quickopen.png' });

// --- Phase 2d: settings apply live and persist (word wrap + minimap) ---
await page.locator('.nx-editor-tab:has-text("main.py")').first().click();
await page.waitForTimeout(1200);
await page.click('.monaco-editor .view-lines').catch(() => {});
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
await page.keyboard.type('# ' + 'x'.repeat(240));
await page.waitForTimeout(800);
const linesBefore = await page.evaluate(() => document.querySelectorAll('.monaco-editor .view-lines > div').length);
await page.keyboard.press('Control+,');
await page.waitForTimeout(1000);
await page.locator('button.sp-toggle:has-text("Word wrap")').click();
await page.locator('button.sp-toggle:has-text("Minimap")').click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
const after = await page.evaluate(() => ({
  lines: document.querySelectorAll('.monaco-editor .view-lines > div').length,
  minimap: !!document.querySelector('.monaco-editor .minimap'),
}));
const cfg2 = JSON.parse(fs.readFileSync(cfgSub + '/config.json', 'utf8'));
const rawSettings = cfg2['nexel-settings'];
const settings2 = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings ?? {});
const persisted2 = settings2?.state?.wordWrap === true && settings2?.state?.minimap === true;
report('SETTINGS_APPLY_REAL', after.lines > linesBefore && after.minimap && persisted2, JSON.stringify({ linesBefore, ...after, persisted: persisted2 }));
await page.screenshot({ path: dir + '/r11-settings-apply.png' });

// --- Phase 2e: Ctrl+backquote toggles the terminal (listed binding was dead) ---
const termBefore = await page.evaluate(() => !!document.querySelector('.nx-terminal-panel'));
await page.keyboard.press('Control+`');
await page.waitForTimeout(800);
const termAfterOpen = await page.evaluate(() => !!document.querySelector('.nx-terminal-panel'));
await page.keyboard.press('Control+`');
await page.waitForTimeout(600);
const termAfterClose = await page.evaluate(() => !!document.querySelector('.nx-terminal-panel'));
report('TERMINAL_HOTKEY_REAL', !termBefore && termAfterOpen && !termAfterClose, JSON.stringify({ termBefore, termAfterOpen, termAfterClose }));

// --- Phase 2f: Ctrl+Tab cycles tabs, Ctrl+Shift+Tab cycles back ---
const tabCount = await page.evaluate(() => document.querySelectorAll('.nx-editor-tab').length);
const activeBefore2 = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? '');
await page.keyboard.press('Control+Tab');
await page.waitForTimeout(700);
const activeNext = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? '');
await page.keyboard.press('Control+Shift+Tab');
await page.waitForTimeout(700);
const activeBack = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? '');
report('TABS_CYCLE_REAL', tabCount >= 2 && activeNext !== activeBefore2 && activeBack === activeBefore2, JSON.stringify({ tabCount, activeBefore2, activeNext, activeBack }));

// --- Phase 2g: middle-click closes a tab ---
const mcBefore = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
await page.locator('.nx-editor-tab:has-text("README.md")').first().click({ button: 'middle' });
await page.waitForTimeout(700);
const mcAfter = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_MIDDLECLOSE_REAL', mcBefore.includes('README.md') && !mcAfter.includes('README.md'), JSON.stringify({ mcBefore, mcAfter }));

// --- Phase 2h: breadcrumb click reveals the file in the explorer ---
// Clicking the 'src' folder crumb must reveal+select that folder in the explorer.
// (The file crumb can't be used for this assertion: the active file's row is 'active', not 'selected'.)
await page.locator('.nx-crumbs button.nx-crumb-btn', { hasText: 'src' }).last().click({ timeout: 8000 }).catch((e) => console.log('CRUMB_CLICK_ERR', String(e).slice(0, 200)));
await page.waitForTimeout(700);
const crumbReveal = await page.evaluate(() => {
  const row = document.querySelector('.nx-row-focused');
  const crumbs = [...document.querySelectorAll('.nx-crumbs button.nx-crumb-btn')].map((b) => b.textContent);
  return { focused: row ? row.textContent : null, crumbs };
});
report('CRUMB_REVEAL_REAL', !!crumbReveal.focused && crumbReveal.focused.includes('src'), JSON.stringify(crumbReveal));

// --- Phase 2i: closing an INACTIVE tab keeps the active editor visible ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1200);
// main.py is active again after the explorer click? No - explorer click opens+activates README. Re-activate main.py:
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(600);
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(700);
const closeInactive = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
  welcome: !!document.querySelector('.nx-welcome-card, .nx-welcome-backdrop'),
  activeTitle: document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null,
}));
report('TABS_CLOSE_INACTIVE_REAL', !closeInactive.tabs.includes('README.md') && closeInactive.footer && !closeInactive.welcome && closeInactive.activeTitle === 'main.py', JSON.stringify(closeInactive));

// --- Phase 2j: closing the ACTIVE tab selects the neighbor ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1200);
// README is now active (explorer click activates). Close it via its X:
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(700);
const closeActive = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
  activeTitle: document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null,
}));
report('TABS_CLOSE_ACTIVE_REAL', !closeActive.tabs.includes('README.md') && closeActive.footer && closeActive.activeTitle === 'main.py', JSON.stringify(closeActive));

// --- Phase 2k: dirty-close dialog - cancel keeps tab+buffer+disk; discard closes without writing ---
const readmeBefore = fs.readFileSync(ws + '/README.md', 'utf8');
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1200);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('dirty-marker');
await page.waitForTimeout(400);
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(600);
const dirtyDlg = await page.evaluate(() => ({ box: !!document.querySelector('.nx-cf-box'), msg: document.querySelector('.nx-cf-msg')?.textContent ?? '' }));
await page.screenshot({ path: dir + '/r13-dirty-dialog.png' });
await page.locator('.nx-cf-cancel').click();
await page.waitForTimeout(500);
const dirtyCancel = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  dirty: !!document.querySelector('.nx-editor-tab .nx-dirty-indicator-glow'),
  buf: (document.querySelector('.view-lines')?.textContent ?? '').includes('dirty-marker'),
}));
const diskAfterCancel = fs.readFileSync(ws + '/README.md', 'utf8') === readmeBefore;
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(500);
await page.locator('.nx-cf-discard').click();
await page.waitForTimeout(600);
const afterDiscard = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
const diskAfterDiscard = fs.readFileSync(ws + '/README.md', 'utf8') === readmeBefore;
report('TABS_DIRTY_CANCEL_REAL', dirtyDlg.box && dirtyDlg.msg.includes('README.md') && dirtyCancel.tabs.includes('README.md') && dirtyCancel.dirty && dirtyCancel.buf && diskAfterCancel && !afterDiscard.includes('README.md') && diskAfterDiscard, JSON.stringify({ dirtyDlg, dirtyCancel, diskAfterCancel, afterDiscard, diskAfterDiscard }));

// --- Phase 3: real PTY terminal lifecycle ---
await page.click('.sb-bar >> text=Terminal');
await page.waitForFunction(() => (document.querySelector('.xterm-rows')?.textContent ?? '').includes('$'), { timeout: 20000 });
await page.evaluate(() => { const ta = document.querySelector('.xterm textarea'); if (ta) ta.focus(); });
await page.mouse.click(720, 500);
await page.evaluate(() => { const ta = document.querySelector('.xterm textarea'); if (ta) ta.focus(); });
await page.keyboard.type('echo NX$((20+22))');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const termText = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
report('TERM_PTY', termText.includes('NX42'), JSON.stringify(termText.slice(-120)));
await page.keyboard.type('export PS1="user@nexel:~$ "'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
await page.keyboard.type('clear'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
await page.screenshot({ path: dir + '/r4-terminal.png' });

// --- Phase 3a-ii: terminal Clear and Restart buttons ---
await page.locator('.xterm-helper-textarea').first().focus().catch(() => {});
await page.keyboard.type("echo CLR1");
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.locator('button.nx-term-header-btn.clear').first().click();
await page.waitForTimeout(500);
const afterClear = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
await page.locator('.xterm-helper-textarea').first().focus().catch(() => {});
await page.locator('button.nx-term-header-btn.restart').first().click();
await page.waitForTimeout(2500);
await page.locator('.xterm-helper-textarea').first().focus().catch(() => {});
await page.keyboard.type("echo RST7");
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
const afterRestart = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
report('TERM_PANEL_REAL', !afterClear.includes('CLR1') && afterRestart.includes('RST7'), JSON.stringify({ afterClear: afterClear.slice(-60), afterRestart: afterRestart.slice(-80) }));

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

await page.locator('.nx-node-row:has-text("todo.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click({ timeout: 10000 });
await page.waitForTimeout(600);
const delDlg = await page.evaluate(() => ({ box: !!document.querySelector('.nx-cf-box'), msg: document.querySelector('.nx-cf-msg')?.textContent ?? '' }));
await page.locator('.nx-cf-cancel').click(); await page.waitForTimeout(400);
const keptAfterCancel = fs.existsSync(ws + '/src/todo.txt');
await page.locator('.nx-node-row:has-text("todo.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click({ timeout: 10000 });
await page.waitForTimeout(600);
await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(1000);
const deletedOk = !fs.existsSync(ws + '/src/todo.txt');
const deletedRow = await page.evaluate(() => ![...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('todo.txt')));
report('DELETE_REAL', delDlg.box && delDlg.msg.includes('todo.txt') && keptAfterCancel && deletedOk && deletedRow, JSON.stringify({ delDlg, keptAfterCancel, deletedOk, deletedRow }));

// --- Phase 3f: tab menu - Close Other Tabs / Close Tabs to the Right ---
// Self-stabilizing: activate main.py (opening it if needed), Close Other Tabs leaves only it;
// reopen two tabs to its right, then Close Tabs to the Right leaves only main.py again.
const tabDlg = (d) => d.accept().catch(() => {});
page.on('dialog', tabDlg);
if (!await page.locator('.nx-editor-tab:has-text("main.py")').count()) {
  await page.locator('.nx-node-row:has-text("main.py")').first().click(); await page.waitForTimeout(800);
}
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
if (!await page.locator('.nx-editor-tab:has-text("README.md")').count()) {
  await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(800);
}
if (!await page.locator('.nx-editor-tab:has-text("main.cpp")').count()) {
  await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(1200);
}
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(800);
if (await page.locator('.nx-cf-box').count()) { await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(500); }
const closeOthers = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
}));
report('TABS_CLOSE_OTHERS_REAL', closeOthers.tabs.length === 1 && closeOthers.tabs[0] === 'main.py' && closeOthers.footer, JSON.stringify(closeOthers));

await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Tabs to the Right' }).first().click(); await page.waitForTimeout(800);
if (await page.locator('.nx-cf-box').count()) { await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(500); }
const closeRight = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
}));
page.off('dialog', tabDlg);
report('TABS_CLOSE_RIGHT_REAL', closeRight.tabs.length === 1 && closeRight.tabs[0] === 'main.py' && closeRight.footer, JSON.stringify(closeRight));

// --- Phase 3g: Close Tabs to the Right from a MIDDLE tab preserves the left side ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-editor-tab:has-text("README.md")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Tabs to the Right' }).first().click(); await page.waitForTimeout(800);
const closeRightMid = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_CLOSE_RIGHT_MID_REAL', closeRightMid.length === 2 && closeRightMid[0] === 'main.py' && closeRightMid[1] === 'README.md', JSON.stringify(closeRightMid));

// --- Phase 3g-ii: Close Tabs to the Left from the rightmost tab preserves the right side ---
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(800);
// tabs now [main.py, README.md, main.cpp]; activate main.cpp (rightmost), close left -> [main.cpp]
const leftDlg = (d) => d.accept().catch(() => {});
page.on('dialog', leftDlg);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Tabs to the Left' }).first().click(); await page.waitForTimeout(800);
if (await page.locator('.nx-cf-box').count()) { await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(500); }
page.off('dialog', leftDlg);
const closeLeft = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_CLOSE_LEFT_REAL', closeLeft.length === 1 && closeLeft[0] === 'main.cpp', JSON.stringify(closeLeft));
// restore main.py + README for subsequent phases
await page.locator('.nx-node-row:has-text("main.py")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(800);

// --- Phase 3h: bulk close dirty guard - cancel keeps all tabs/buffers/disk; Save all writes only targets; excluded active tab keeps its edit unsaved ---
// Fresh renderer state (matches the isolated probe this scenario was validated with).
await page.reload(); await page.waitForTimeout(4500);
await page.locator('.nx-node-row:has-text("src")').first().click({ timeout: 15000 }); await page.waitForTimeout(600);
await page.locator('.nx-node-row:has-text("main.py")').first().click(); await page.waitForTimeout(1200);
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(800);
await page.locator('.nx-editor-tab:has-text("README.md")').first().click(); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('R1MARKER'); await page.waitForTimeout(300);
await page.locator('.nx-editor-tab:has-text("main.cpp")').first().click(); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('C1MARKER'); await page.waitForTimeout(300);
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('ACTIVEMARK'); await page.waitForTimeout(300);
const pyDiskBefore = fs.readFileSync(ws + '/src/main.py', 'utf8');
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(600);
const bulkDlg = await page.evaluate(() => ({
  box: !!document.querySelector('.nx-cf-box'),
  msg: document.querySelector('.nx-cf-msg')?.textContent ?? '',
  detail: document.querySelector('.nx-cf-detail')?.textContent ?? '',
}));
await page.locator('.nx-cf-cancel').click(); await page.waitForTimeout(500);
const cancelTabs = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
let readmeKept = false, cppKept = false;
if (cancelTabs.includes('README.md')) {
  await page.locator('.nx-editor-tab:has-text("README.md")').first().click(); await page.waitForTimeout(500);
  readmeKept = await page.evaluate(() => (document.querySelector('.view-lines')?.textContent ?? '').includes('R1MARKER'));
}
if (cancelTabs.includes('main.cpp')) {
  await page.locator('.nx-editor-tab:has-text("main.cpp")').first().click(); await page.waitForTimeout(500);
  cppKept = await page.evaluate(() => (document.querySelector('.view-lines')?.textContent ?? '').includes('C1MARKER'));
}
const bulkDiskCancel = !fs.readFileSync(ws + '/README.md', 'utf8').includes('R1MARKER') && !fs.readFileSync(ws + '/src/main.cpp', 'utf8').includes('C1MARKER') && fs.readFileSync(ws + '/src/main.py', 'utf8') === pyDiskBefore;
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(600);
await page.locator('.nx-cf-save').click(); await page.waitForTimeout(1000);
const acceptTabs = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
const savedDisks = fs.readFileSync(ws + '/README.md', 'utf8').includes('R1MARKER') && fs.readFileSync(ws + '/src/main.cpp', 'utf8').includes('C1MARKER');
const pyStillDirty = await page.evaluate(() => !!document.querySelector('.nx-editor-tab .nx-dirty-indicator-glow'));
const pyKept = await page.evaluate(() => (document.querySelector('.view-lines')?.textContent ?? '').includes('ACTIVEMARK'));
const pyDiskExcluded = !fs.readFileSync(ws + '/src/main.py', 'utf8').includes('ACTIVEMARK');
await page.keyboard.press('Control+s'); await page.waitForTimeout(600);
report('TABS_BULK_DIRTY_REAL', bulkDlg.box && bulkDlg.msg.includes('2') && !bulkDlg.detail.includes('main.py') && cancelTabs.length === 3 && readmeKept && cppKept && bulkDiskCancel && acceptTabs.length === 1 && acceptTabs[0] === 'main.py' && savedDisks && pyStillDirty && pyKept && pyDiskExcluded, JSON.stringify({ bulkDlg, cancelTabs, readmeKept, cppKept, bulkDiskCancel, acceptTabs, savedDisks, pyStillDirty, pyKept, pyDiskExcluded }));

// --- Phase 3g: zen mode toggles chrome visibility ---
await page.keyboard.press('Control+Alt+z'); await page.waitForTimeout(600);
const zenOn = await page.evaluate(() => ({
  cls: document.documentElement.classList.contains('nx-zen'),
  sidebarOpacity: getComputedStyle(document.querySelector('.nx-sidebar-container')).opacity,
}));
await page.keyboard.press('Control+Alt+z'); await page.waitForTimeout(600);
const zenOff = await page.evaluate(() => ({
  cls: document.documentElement.classList.contains('nx-zen'),
  sidebarOpacity: getComputedStyle(document.querySelector('.nx-sidebar-container')).opacity,
}));
report('ZEN_REAL', zenOn.cls && zenOn.sidebarOpacity === '0' && !zenOff.cls && zenOff.sidebarOpacity === '1', JSON.stringify({ zenOn, zenOff }));

// --- Phase 3i: command palette opens, filters, and executes a command ---
await page.keyboard.press('Control+Shift+p'); await page.waitForTimeout(700);
const palOpen = await page.evaluate(() => !!document.querySelector('.cp-box'));
await page.locator('.cp-input').first().click(); await page.keyboard.type('zen'); await page.waitForTimeout(500);
const palItems = await page.evaluate(() => [...document.querySelectorAll('.cp-list *')].map((x) => x.textContent).filter(Boolean).slice(0, 8));
await page.keyboard.press('Enter'); await page.waitForTimeout(700);
const palAfter = await page.evaluate(() => ({
  closed: !document.querySelector('.cp-box'),
  zen: document.documentElement.classList.contains('nx-zen'),
}));
await page.keyboard.press('Control+Alt+z'); await page.waitForTimeout(500);
const zenRestored = await page.evaluate(() => !document.documentElement.classList.contains('nx-zen'));
report('PALETTE_REAL', palOpen && palItems.some((t) => t.includes('Toggle Zen Mode')) && palAfter.closed && palAfter.zen && zenRestored, JSON.stringify({ palOpen, palItems, palAfter, zenRestored }));

// --- Phase 3j: Ctrl+W closes the active tab and selects the neighbor ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1200);
await page.keyboard.press('Control+w'); await page.waitForTimeout(800);
const ctrlW = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  activeTitle: document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null,
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
}));
report('TABS_CTRLW_REAL', !ctrlW.tabs.includes('README.md') && ctrlW.activeTitle === 'main.py' && ctrlW.footer, JSON.stringify(ctrlW));

// --- Phase 3k: Ctrl+\\ splits, Ctrl+1/Ctrl+2 move pane focus, Ctrl+\\ unsplits ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1000);
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
await page.keyboard.press('Control+\\'); await page.waitForTimeout(800);
const splitOn = await page.evaluate(() => ({
  rightPane: !!document.querySelector('.nx-right-pane-content'),
  rightTitle: document.querySelector('.nx-right-pane-title')?.textContent ?? null,
  focused: document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null,
}));
await page.keyboard.press('Control+1'); await page.waitForTimeout(500);
const focusLeft = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null);
await page.keyboard.press('Control+2'); await page.waitForTimeout(500);
const focusRight = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null);
await page.keyboard.press('Control+\\'); await page.waitForTimeout(800);
const splitOff = await page.evaluate(() => !document.querySelector('.nx-right-pane-content'));
report('SPLIT_REAL', splitOn.rightPane && splitOn.rightTitle === 'main.py' && focusLeft === 'README.md' && focusRight === 'main.py' && splitOff, JSON.stringify({ splitOn, focusLeft, focusRight, splitOff }));

// --- Phase: explorer keyboard navigation (arrow keys + Enter) ---
// Collapse all for a deterministic tree, then click the src folder row: selects it, focuses the tree, expands it.
await page.locator('.nx-action-btn[title="Collapse All Folders"]').click(); await page.waitForTimeout(600);
await page.locator('.nx-node-row', { hasText: 'src' }).first().click(); await page.waitForTimeout(500);
// rows now: [src(open), main.py, main.cpp, README.md]; selection on src. ArrowDown moves to main.py.
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
const kbMove = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')];
  const sel = rows.findIndex((r) => r.classList.contains('nx-row-focused') || r.classList.contains('nx-row-selected'));
  const srcIdx = rows.findIndex((r) => r.textContent === 'src');
  return { sel, srcIdx, count: rows.length, selText: rows[sel]?.textContent ?? null };
});
report('EXPLORER_KB_MOVE_REAL', kbMove.srcIdx === 0 && kbMove.sel === 1 && kbMove.count === 4, JSON.stringify(kbMove));
// ArrowUp back to src, Enter closes the folder; Enter again reopens; ArrowDown to main.py; Enter opens the file tab.
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
const kbClosed = await page.evaluate(() => document.querySelectorAll('.nx-tree-scroll .nx-node-row').length);
await page.keyboard.press('Enter'); await page.waitForTimeout(600);
const kbReopen = await page.evaluate(() => document.querySelectorAll('.nx-tree-scroll .nx-node-row').length);
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
const kbEnter = await page.evaluate(() => document.querySelector('.nx-editor-tab.active .nx-tab-title')?.textContent ?? null);
report('EXPLORER_KB_OPEN_REAL', kbClosed === 2 && kbReopen === 4 && kbEnter === 'main.cpp', JSON.stringify({ kbClosed, kbReopen, kbEnter }));
await page.locator('.nx-explorer-wrapper').screenshot({ path: dir + '/r6-explorer-kb.png' });

// --- Phase: F2 opens inline rename for the selected node and commits on Enter ---
fs.writeFileSync(ws + '/kbf2.txt', 'rename me');
await page.locator('.nx-action-btn[title="Refresh Tree"]').click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row', { hasText: 'kbf2.txt' }).first().click(); await page.waitForTimeout(400);
await page.keyboard.press('F2'); await page.waitForTimeout(500);
const f2Input = await page.evaluate(() => {
  const inp = document.querySelector('.nx-inline-textbox');
  return inp ? { value: inp.value, focused: document.activeElement === inp } : null;
});
// rename autofocus selects the basename; typing replaces it and keeps the extension
await page.keyboard.type('kbf2-renamed'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
const f2Done = await page.evaluate(() => [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'kbf2-renamed.txt'));
const f2Disk = fs.existsSync(ws + '/kbf2-renamed.txt') && !fs.existsSync(ws + '/kbf2.txt');
report('EXPLORER_KB_F2_REAL', f2Input !== null && f2Input.value === 'kbf2.txt' && f2Input.focused && f2Done && f2Disk, JSON.stringify({ f2Input, f2Done, f2Disk }));

// --- Phase: Delete key on the focused tree honors cancel and dirty-open state ---
fs.writeFileSync(ws + '/kbdel.txt', 'scratch');
await page.locator('.nx-action-btn[title="Refresh Tree"]').click(); await page.waitForTimeout(800);
await page.locator('.nx-node-row', { hasText: 'kbdel.txt' }).first().click(); await page.waitForTimeout(400);
// 1) cancel keeps the file in the tree and on disk
await page.keyboard.press('Delete'); await page.waitForTimeout(600);
await page.locator('.nx-cf-cancel').click(); await page.waitForTimeout(400);
const afterCancel = await page.evaluate(() => [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'kbdel.txt'));
const kbDiskKept = fs.existsSync(ws + '/kbdel.txt');
// 2) dirty: warning names unsaved changes; cancel keeps the file
await page.locator('.nx-node-row', { hasText: 'kbdel.txt' }).first().click(); await page.waitForTimeout(800);
await page.locator('.view-lines').first().click(); await page.keyboard.type('dirty'); await page.waitForTimeout(500);
await page.locator('.nx-node-row', { hasText: 'kbdel.txt' }).first().click(); await page.waitForTimeout(300);
await page.keyboard.press('Delete'); await page.waitForTimeout(600);
const dirtyMsg = await page.evaluate(() => (document.querySelector('.nx-cf-detail')?.textContent ?? '') + '|' + (document.querySelector('.nx-cf-msg')?.textContent ?? ''));
await page.locator('.nx-cf-cancel').click(); await page.waitForTimeout(400);
const afterDirtyCancel = await page.evaluate(() => [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'kbdel.txt'));
const diskAfterDirty = fs.existsSync(ws + '/kbdel.txt');
// 3) Delete button: file deleted on disk and from the tree; the dirty tab stays open with its buffer
await page.locator('.nx-node-row', { hasText: 'kbdel.txt' }).first().click(); await page.waitForTimeout(300);
await page.keyboard.press('Delete'); await page.waitForTimeout(600);
await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(900);
const delAfterAccept = await page.evaluate(() => ({
  rowGone: ![...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'kbdel.txt'),
  tabOpen: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].some((t) => t.textContent === 'kbdel.txt'),
  orphanBadge: !!document.querySelector('.nx-tab-orphaned .nx-tab-orphan-badge'),
  toast: [...document.querySelectorAll('.tz-toast')].some((t) => /kept.*buffer|save to recreate/i.test(t.textContent ?? '')),
}));
const diskGone = !fs.existsSync(ws + '/kbdel.txt');
report('EXPLORER_KB_DELETE_REAL', afterCancel && kbDiskKept && afterDirtyCancel && diskAfterDirty && /unsaved/i.test(dirtyMsg) && delAfterAccept.rowGone && delAfterAccept.tabOpen && delAfterAccept.orphanBadge && delAfterAccept.toast && diskGone, JSON.stringify({ afterCancel, kbDiskKept, afterDirtyCancel, diskAfterDirty, delAfterAccept, diskGone, dirtyMsg: dirtyMsg.slice(0, 140) }));

// --- Phase: folder delete failure surfaces an error and reconciles tree/tabs with disk ---
// locked/ is not writable, so the recursive rm aborts on stay.txt; entry processing order is
// not contractual, so tree/tab accuracy is asserted against actual disk state, not assumed order.
fs.mkdirSync(ws + '/pf/locked', { recursive: true });
fs.writeFileSync(ws + '/pf/gone.txt', 'gone sibling\n');
fs.writeFileSync(ws + '/pf/locked/stay.txt', 'stay\n');
fs.chmodSync(ws + '/pf/locked', 0o555);
await page.locator('.nx-action-btn[title="Refresh Tree"]').click(); await page.waitForTimeout(900);
await page.locator('.nx-node-row', { hasText: 'pf' }).first().click(); await page.waitForTimeout(500);
await page.locator('.nx-node-row', { hasText: 'gone.txt' }).first().dblclick(); await page.waitForTimeout(900);
await page.locator('.nx-node-row', { hasText: 'locked' }).first().click(); await page.waitForTimeout(500);
await page.locator('.nx-node-row', { hasText: 'stay.txt' }).first().dblclick(); await page.waitForTimeout(900);
await page.locator('.view-lines').first().click(); await page.keyboard.type(' dirty'); await page.waitForTimeout(400);
await page.locator('.nx-node-row', { hasText: 'pf' }).first().click({ button: 'right' }); await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click(); await page.waitForTimeout(700);
const pfMsg = await page.evaluate(() => (document.querySelector('.nx-cf-detail')?.textContent ?? '') + '|' + (document.querySelector('.nx-cf-msg')?.textContent ?? ''));
await page.locator('.nx-cf-discard').click(); await page.waitForTimeout(1400);
// refreshTree preserves expanded folders, so descendants remain visible.
const pfState = await page.evaluate(() => ({
  errorToast: [...document.querySelectorAll('.tz-toast')].some((t) => /could not delete/i.test(t.textContent ?? '')),
  stayRow: [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'stay.txt'),
  goneRow: [...document.querySelectorAll('.nx-tree-scroll .nx-node-row')].some((r) => r.textContent === 'gone.txt'),
  tabs: [...document.querySelectorAll('.nx-editor-tab')].map((t) => ({ title: t.querySelector('.nx-tab-title')?.textContent ?? '', orphaned: t.classList.contains('nx-tab-orphaned') })),
}));
const pfGoneDisk = fs.existsSync(ws + '/pf/gone.txt');
const pfStayDisk = fs.existsSync(ws + '/pf/locked/stay.txt');
fs.chmodSync(ws + '/pf/locked', 0o755);
const pfGoneTab = pfState.tabs.find((t) => t.title === 'gone.txt');
const pfStayTab = pfState.tabs.find((t) => t.title === 'stay.txt');
report('DELETE_FOLDER_PARTIAL_REAL',
  pfMsg.includes('stay.txt') && /unsaved/i.test(pfMsg) && pfState.errorToast &&
  !pfGoneDisk && pfStayDisk && pfState.stayRow && !!pfStayTab && pfStayTab.orphaned === false &&
  !!pfGoneTab && pfGoneTab.orphaned === !pfGoneDisk && pfState.goneRow === pfGoneDisk,
  JSON.stringify({ pfMsg: pfMsg.slice(0, 140), pfState, pfGoneDisk, pfStayDisk }));
await page.locator('.nx-editor-tab', { hasText: 'kbdel.txt' }).first().click();
await page.locator('.nx-tab-orphaned', { hasText: 'kbdel.txt' }).screenshot({ path: dir + '/r7-orphan-tab.png' });
await page.locator('.tz-toast').last().screenshot({ path: dir + '/r8-orphan-toast.png' });

// --- Phase: editor font zoom keys apply, and are inert when the terminal has focus ---
const fontProbe = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.view-line')).fontSize));
await page.locator('.view-lines').first().click(); await page.waitForTimeout(300);
const fontBefore = await fontProbe();
await page.keyboard.press('Control+='); await page.waitForTimeout(400);
const fontUp = await fontProbe();
await page.keyboard.press('Control+-'); await page.keyboard.press('Control+-'); await page.waitForTimeout(400);
const fontDown = await fontProbe();
await page.keyboard.press('Control+0'); await page.waitForTimeout(400);
const fontReset = await fontProbe();
// terminal context: open the panel if needed, focus the shell, Ctrl+= must not change the editor font
if (!(await page.$('.xterm'))) { await page.keyboard.press('Control+\`'); await page.waitForTimeout(900); }
await page.locator('.xterm').first().click(); await page.waitForTimeout(400);
await page.keyboard.press('Control+='); await page.waitForTimeout(400);
const fontTermFocus = await fontProbe();
report('FONT_ZOOM_REAL', fontUp === fontBefore + 1 && fontDown === fontUp - 2 && fontReset === 13 && fontTermFocus === 13, JSON.stringify({ fontBefore, fontUp, fontDown, fontReset, fontTermFocus }));

// --- Capture: zoomed editor surface + the shortcut sheet rows listing the zoom bindings ---
// clean scene: hide the terminal panel and wait out any lingering toast before shooting
if (await page.$('.xterm')) { await page.keyboard.press('Control+`'); await page.waitForTimeout(500); }
try { await page.waitForSelector('.tz-toast', { state: 'detached', timeout: 8000 }); } catch {}
await page.locator('.view-lines').first().click(); await page.waitForTimeout(300);
await page.keyboard.press('Control+='); await page.keyboard.press('Control+='); await page.keyboard.press('Control+='); await page.waitForTimeout(500);
await page.locator('.nx-editor-canvas').screenshot({ path: dir + '/r9-font-zoom.png' });
await page.keyboard.press('Control+0'); await page.waitForTimeout(300);
// blur the editor so Ctrl+/ reaches the window handler and opens the sheet
await page.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur(); }); await page.waitForTimeout(200);
await page.keyboard.press('Control+/'); await page.waitForTimeout(600);
const sheetRows = await page.evaluate(() => [...document.querySelectorAll('.ss-box div, .ss-box span')].filter((el) => el.children.length === 0 && /editor font/i.test(el.textContent ?? '')).map((el) => el.textContent));
await page.locator('.ss-box').screenshot({ path: dir + '/r10-shortcuts.png' });
// xterm consumes Escape for the shell, so move focus into the sheet first, then Escape closes it
await page.locator('.ss-head').first().click(); await page.waitForTimeout(200);
await page.keyboard.press('Escape');
try { await page.waitForSelector('.ss-backdrop', { state: 'detached', timeout: 3000 }); }
catch { throw new Error('shortcut sheet did not close after Escape'); }
report('FONT_ZOOM_SHEET_REAL', sheetRows.length === 3, JSON.stringify(sheetRows));

// --- Phase: modal isolation - with the sheet open, chrome under it takes no pointer, focus or keys ---
await page.keyboard.press('Control+`'); await page.waitForTimeout(900); // open terminal
await page.locator('.xterm').first().click(); await page.waitForTimeout(400);
const refocusControl = await page.evaluate(() => document.activeElement?.classList?.contains('xterm-helper-textarea') ?? false);
const rowsBefore = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
const termBox = await page.locator('.xterm').first().boundingBox();
await page.keyboard.press('Control+/'); await page.waitForTimeout(600);
// a point over the terminal, right of the dock and left of the centered sheet box
const boxRect = await page.locator('.ss-box').boundingBox();
// pick a point over the terminal that the centered sheet box does not cover: below the box if it fits, else bottom-left corner
let isoPt = { x: Math.round(termBox.x + termBox.width / 2), y: Math.round(boxRect.y + boxRect.height + 20) };
const outside = (pt) => pt.x < boxRect.x || pt.x > boxRect.x + boxRect.width || pt.y < boxRect.y || pt.y > boxRect.y + boxRect.height;
if (isoPt.y > termBox.y + termBox.height - 10 || !outside(isoPt)) isoPt = { x: Math.round(termBox.x + 15), y: Math.round(termBox.y + termBox.height - 15) };
const iso = await page.evaluate((pt) => {
  const top = document.elementsFromPoint(pt.x, pt.y)[0];
  return { topIsBackdrop: top?.classList?.contains('ss-backdrop') ?? false, topClass: String(top?.className ?? '') };
}, isoPt);
const sheetHasFocus = await page.evaluate(() => document.activeElement?.classList?.contains('ss-box') ?? false);
await page.keyboard.press('x'); await page.waitForTimeout(400);
const rowsAfterKeys = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
await page.mouse.click(isoPt.x, isoPt.y); await page.waitForTimeout(400);
const afterClick = await page.evaluate(() => ({
  sheetGone: !document.querySelector('.ss-backdrop'),
  activeIsXterm: document.activeElement?.classList?.contains('xterm-helper-textarea') ?? false,
}));
report('MODAL_ISOLATION_REAL', iso.topIsBackdrop && sheetHasFocus && rowsAfterKeys === rowsBefore && afterClick.sheetGone && !afterClick.activeIsXterm && refocusControl,
  JSON.stringify({ iso, isoPt, termBox, sheetHasFocus, keysLeaked: rowsAfterKeys !== rowsBefore, afterClick, refocusControl }));
// recover the scene regardless of how the click landed
await page.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur(); });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('.ss-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForSelector('.ss-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
await page.keyboard.press('Control+`'); await page.waitForTimeout(500); // restore scene: terminal hidden

// --- Phase: settings modal isolation - same keyboard/pointer contract as the shortcut sheet ---
await page.keyboard.press('Control+`'); await page.waitForTimeout(900); // open terminal
await page.locator('.xterm').first().click(); await page.waitForTimeout(400);
const spControl = await page.evaluate(() => document.activeElement?.classList?.contains('xterm-helper-textarea') ?? false);
const spRowsBefore = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
const spTermBox = await page.locator('.xterm').first().boundingBox();
await page.keyboard.press('Control+,'); await page.waitForTimeout(600);
const spBoxRect = await page.locator('.sp-box').boundingBox();
let spPt = { x: Math.round(spTermBox.x + spTermBox.width / 2), y: Math.round(spBoxRect.y + spBoxRect.height + 20) };
const spOutside = (pt) => pt.x < spBoxRect.x || pt.x > spBoxRect.x + spBoxRect.width || pt.y < spBoxRect.y || pt.y > spBoxRect.y + spBoxRect.height;
if (spPt.y > spTermBox.y + spTermBox.height - 10 || !spOutside(spPt)) spPt = { x: Math.round(spTermBox.x + 15), y: Math.round(spTermBox.y + spTermBox.height - 15) };
const spIso = await page.evaluate((pt) => {
  const top = document.elementsFromPoint(pt.x, pt.y)[0];
  return { topIsBackdrop: top?.classList?.contains('sp-backdrop') ?? false, topClass: String(top?.className ?? '') };
}, spPt);
const spHasFocus = await page.evaluate(() => document.activeElement?.classList?.contains('sp-box') ?? false);
await page.keyboard.press('x'); await page.waitForTimeout(400);
const spRowsAfter = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
await page.mouse.click(spPt.x, spPt.y); await page.waitForTimeout(400);
const spAfterClick = await page.evaluate(() => ({
  sheetGone: !document.querySelector('.sp-backdrop'),
  activeIsXterm: document.activeElement?.classList?.contains('xterm-helper-textarea') ?? false,
}));
report('SETTINGS_ISOLATION_REAL', spIso.topIsBackdrop && spHasFocus && spRowsAfter === spRowsBefore && spAfterClick.sheetGone && !spAfterClick.activeIsXterm && spControl,
  JSON.stringify({ spIso, spPt, spBoxRect, spHasFocus, keysLeaked: spRowsAfter !== spRowsBefore, spAfterClick, spControl }));
// recover the scene regardless of how the click landed
await page.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur(); });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('.sp-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForSelector('.sp-backdrop', { state: 'detached', timeout: 3000 }).catch(() => {});
await page.keyboard.press('Control+`'); await page.waitForTimeout(500); // terminal hidden again

// --- Phase: orphaned buffer is not silently recreated by auto-save; explicit save recovers ---
await page.locator('.nx-toolbar-btn.auto-save').click(); await page.waitForTimeout(400);
await page.waitForTimeout(6000); // longer than the 5s auto-save loop
const notRecreated = !fs.existsSync(ws + '/kbdel.txt');
const orphanState = await page.evaluate(() => {
  const tab = [...document.querySelectorAll('.nx-editor-tab')].find((t) => t.textContent?.includes('kbdel.txt'));
  return { orphanedClass: tab?.classList.contains('nx-tab-orphaned') ?? false, dirtyDot: !!tab?.querySelector('.nx-dirty-indicator-glow') };
});
// explicit Ctrl+S is a deliberate recovery: it recreates the file and clears the orphan state
await page.locator('.nx-editor-tab', { hasText: 'kbdel.txt' }).first().click(); await page.waitForTimeout(400);
await page.keyboard.press('Control+s'); await page.waitForTimeout(800);
const recreated = fs.existsSync(ws + '/kbdel.txt');
const orphanCleared = await page.evaluate(() => {
  const tab = [...document.querySelectorAll('.nx-editor-tab')].find((t) => t.textContent?.includes('kbdel.txt'));
  return tab ? !tab.classList.contains('nx-tab-orphaned') : false;
});
await page.locator('.nx-toolbar-btn.auto-save').click(); await page.waitForTimeout(300);
fs.unlinkSync(ws + '/kbdel.txt');
report('ORPHAN_AUTOSAVE_REAL', notRecreated && orphanState.orphanedClass && orphanState.dirtyDot && recreated && orphanCleared, JSON.stringify({ notRecreated, orphanState, recreated, orphanCleared }));
// cleanup: close the orphaned dirty tab, accepting the dirty-close confirm (buffer is moot, file is gone)
const orphanDlg = (d) => d.accept().catch(() => {});
page.on('dialog', orphanDlg);
await page.locator('.nx-editor-tab', { hasText: 'kbdel.txt' }).locator('.nx-tab-x').click().catch(() => {});
await page.waitForTimeout(600);
page.off('dialog', orphanDlg);

await app.close();

// Late renderer errors across every main-session phase (lazy chunks, runtime throws) must not exist.
const lateBad = pageErrors.filter((e) => BAD_ERROR.test(e));
report('RENDERER_CLEAN_REAL', lateBad.length === 0, JSON.stringify(lateBad.slice(0, 3)));

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
  judgeChip: !!document.querySelector('.sb-judge'),
  snippetsBtn: !!document.querySelector('.nx-titlebar-snippets-btn'),
  snippetsToggle: !!document.querySelector('.nx-titlebar-toggle-wrapper'),
}));
report('CP_ON_REAL', cpOn.judgeNav && cpOn.contestsNav && cpOn.judgeChip && cpOn.snippetsBtn && cpOn.snippetsToggle, JSON.stringify(cpOn));
// clean scene for the capture: dismiss any lingering toasts (clangd notice, restored tabs)
await page.evaluate(() => document.querySelectorAll('.tz-toast').forEach((t) => t.dispatchEvent(new MouseEvent('click', { bubbles: true }))));
await page.waitForSelector('.tz-toast', { state: 'detached', timeout: 3000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: dir + '/r5-cp-on.png' });

// --- Phase: CP completion contribution - enabled serves CP items, disabled removes only those ---
// open main.cpp from the seeded workspace
await page.keyboard.press('Control+p'); await page.waitForTimeout(500);
await page.keyboard.type('main.cpp'); await page.waitForTimeout(600);
await page.keyboard.press('Enter'); await page.waitForTimeout(900);
await page.locator('.view-lines').first().click(); await page.waitForTimeout(300);
await page.keyboard.press('Control+End'); await page.waitForTimeout(200);
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
// monaco virtualizes the suggest list: scroll it to collect every row's label
const suggestRows = async () => page.evaluate(async () => {
  const list = document.querySelector('.suggest-widget .monaco-list');
  if (!list) return [];
  const scroller = list.querySelector('.monaco-scrollable-element') || list;
  const seen = new Set();
  for (let i = 0; i <= 40; i++) {
    list.querySelectorAll('.monaco-list-row').forEach((r) => seen.add(r.querySelector('.label-name')?.textContent ?? r.textContent ?? ''));
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
    scroller.scrollTop += 200;
    await new Promise((r) => setTimeout(r, 60));
  }
  scroller.scrollTop = 0;
  return [...seen];
});
await page.keyboard.type('ll'); await page.waitForTimeout(800);
const rowsCpOn = await suggestRows();
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// disable the plugin through the settings UI
await page.keyboard.press('Control+,'); await page.waitForTimeout(700);
await page.locator('button.sp-toggle:has-text("Competitive Programming")').click(); await page.waitForTimeout(400);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.waitForTimeout(300);
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
await page.keyboard.type('ll'); await page.waitForTimeout(800);
const rowsCpOff = await suggestRows();
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// general C++ completions must remain with the plugin off
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.waitForTimeout(200);
await page.keyboard.type('for'); await page.waitForTimeout(800);
const rowsCppGeneral = await suggestRows();
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
report('CP_COMPLETION_REAL',
  rowsCpOn.some((t) => /\bll\b/.test(t)) && !rowsCpOff.some((t) => /\bll\b/.test(t)) && rowsCppGeneral.some((t) => /for/.test(t)),
  JSON.stringify({ onHasCpAlias: rowsCpOn.some((t) => /\bll\b/.test(t)), offHasCpAlias: rowsCpOff.some((t) => /\bll\b/.test(t)), offHasGeneral: rowsCppGeneral.some((t) => /for/.test(t)), onRows: rowsCpOn.slice(0, 12), offRows: rowsCpOff.slice(0, 12), generalRows: rowsCppGeneral.slice(0, 12) }));
await app.close();

// --- Negative control: the boot gate must catch a blank renderer (nothing listens on :5999) ---
const { app: badApp, page: badPage } = await boot('http://127.0.0.1:5999');
await badPage.waitForTimeout(2500);
const badReady = await bootProbe(badPage);
report('BOOT_GATE_NEGATIVE_REAL', !badReady.explorer && badReady.rows === 0 && badReady.nav === 0, JSON.stringify(badReady));
await badApp.close();
const EXPECTED = ['BOOT_READY_REAL','CP_OFF_REAL','CLANGD_QUIET_PYTHON','SAVE_DISK','THEME_SWITCH_REAL','SESSION_RESTORE_REAL','REOPEN_PERSIST','THEME_PERSIST_REAL','SEARCH_REAL','SEARCH_OPEN_REAL','REPLACE_CONFIRM_REAL','TABS_DIRTY_SAVE_REAL','QUICKOPEN_REAL','SETTINGS_APPLY_REAL','TERMINAL_HOTKEY_REAL','TABS_CYCLE_REAL','TABS_MIDDLECLOSE_REAL','CRUMB_REVEAL_REAL','TABS_CLOSE_INACTIVE_REAL','TABS_CLOSE_ACTIVE_REAL','TABS_DIRTY_CANCEL_REAL','TERM_PTY','TERM_PANEL_REAL','CLANGD_NOTICE_CPP','CREATE_FILE_REAL','RENAME_REAL','DELETE_REAL','TABS_CLOSE_OTHERS_REAL','TABS_CLOSE_RIGHT_REAL','TABS_CLOSE_RIGHT_MID_REAL','TABS_CLOSE_LEFT_REAL','TABS_BULK_DIRTY_REAL','ZEN_REAL','PALETTE_REAL','TABS_CTRLW_REAL','SPLIT_REAL','RENDERER_CLEAN_REAL','EXPLORER_KB_MOVE_REAL','EXPLORER_KB_OPEN_REAL','EXPLORER_KB_F2_REAL','EXPLORER_KB_DELETE_REAL','DELETE_FOLDER_PARTIAL_REAL','ORPHAN_AUTOSAVE_REAL','FONT_ZOOM_REAL','FONT_ZOOM_SHEET_REAL','MODAL_ISOLATION_REAL','SETTINGS_ISOLATION_REAL','CP_ON_REAL','CP_COMPLETION_REAL','BOOT_GATE_NEGATIVE_REAL'];
const missing = EXPECTED.filter((n) => !(n in results));
const failed = EXPECTED.filter((n) => results[n] === false);
console.log('SUMMARY', JSON.stringify({ ok: EXPECTED.length - missing.length - failed.length, total: EXPECTED.length, missing, failed }));
if (missing.length || failed.length) { console.log('done WITH FAILURES'); process.exit(1); }
console.log('done');
