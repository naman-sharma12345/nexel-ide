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
await page.waitForTimeout(900);
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

// --- Phase 2k: dismissing the dirty-close confirm keeps tab and content ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(1200);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('dirty-marker');
await page.waitForTimeout(400);
await page.once('dialog', (d) => d.dismiss());
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(700);
const dirtyCancel = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  dirty: !!document.querySelector('.nx-editor-tab .nx-dirty-indicator-glow'),
}));
// cleanup: accept the confirm and close for real
await page.once('dialog', (d) => d.accept());
await page.locator('.nx-editor-tab:has-text("README.md") .nx-tab-close-btn').first().click();
await page.waitForTimeout(700);
const afterAccept = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_DIRTY_CANCEL_REAL', dirtyCancel.tabs.includes('README.md') && dirtyCancel.dirty && !afterAccept.includes('README.md'), JSON.stringify({ dirtyCancel, afterAccept }));

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

const deleteDlg = (d) => d.accept().catch(() => {});
page.on('dialog', deleteDlg);
await page.locator('.nx-node-row:has-text("todo.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click({ timeout: 10000 });
await page.waitForTimeout(1200);
page.off('dialog', deleteDlg);
const deletedOk = !fs.existsSync(ws + '/src/todo.txt');
const deletedRow = await page.evaluate(() => ![...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('todo.txt')));
report('DELETE_REAL', deletedOk && deletedRow, 'disk=' + deletedOk + ' row=' + deletedRow);

// --- Phase 3f: tab menu - Close Other Tabs / Close Tabs to the Right ---
// Self-stabilizing: activate main.py (opening it if needed), Close Other Tabs leaves only it;
// reopen two tabs to its right, then Close Tabs to the Right leaves only main.py again.
const tabDlg = (d) => d.accept().catch(() => {});
page.on('dialog', tabDlg);
if (!await page.locator('.nx-editor-tab:has-text("main.py")').count()) {
  await page.locator('.nx-node-row:has-text("main.py")').first().click(); await page.waitForTimeout(900);
}
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
if (!await page.locator('.nx-editor-tab:has-text("README.md")').count()) {
  await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(900);
}
if (!await page.locator('.nx-editor-tab:has-text("main.cpp")').count()) {
  await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(1200);
}
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(800);
const closeOthers = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
}));
report('TABS_CLOSE_OTHERS_REAL', closeOthers.tabs.length === 1 && closeOthers.tabs[0] === 'main.py' && closeOthers.footer, JSON.stringify(closeOthers));

await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Tabs to the Right' }).first().click(); await page.waitForTimeout(800);
const closeRight = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent),
  footer: !!document.querySelector('.nx-editor-footer-metrics'),
}));
page.off('dialog', tabDlg);
report('TABS_CLOSE_RIGHT_REAL', closeRight.tabs.length === 1 && closeRight.tabs[0] === 'main.py' && closeRight.footer, JSON.stringify(closeRight));

// --- Phase 3g: Close Tabs to the Right from a MIDDLE tab preserves the left side ---
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-editor-tab:has-text("README.md")').first().click(); await page.waitForTimeout(500);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Tabs to the Right' }).first().click(); await page.waitForTimeout(800);
const closeRightMid = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_CLOSE_RIGHT_MID_REAL', closeRightMid.length === 2 && closeRightMid[0] === 'main.py' && closeRightMid[1] === 'README.md', JSON.stringify(closeRightMid));

// --- Phase 3h: bulk close dirty guard - dismiss keeps every tab + content; accept closes only targets ---
// Fresh renderer state (matches the isolated probe this scenario was validated with).
await page.reload(); await page.waitForTimeout(4500);
await page.locator('.nx-node-row:has-text("src")').first().click({ timeout: 15000 }); await page.waitForTimeout(600);
await page.locator('.nx-node-row:has-text("main.py")').first().click(); await page.waitForTimeout(1200);
await page.locator('.nx-node-row:has-text("README.md")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-node-row:has-text("main.cpp")').first().click(); await page.waitForTimeout(900);
await page.locator('.nx-editor-tab:has-text("README.md")').first().click(); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('R1MARKER'); await page.waitForTimeout(300);
await page.locator('.nx-editor-tab:has-text("main.cpp")').first().click(); await page.waitForTimeout(400);
await page.locator('.view-lines').first().click(); await page.keyboard.press('Control+End'); await page.keyboard.type('C1MARKER'); await page.waitForTimeout(300);
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(400);
const bulkDismiss = (d) => d.dismiss().catch(() => {});
page.on('dialog', bulkDismiss);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(900);
page.off('dialog', bulkDismiss);
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
// accept: only the two dirty others close; the active main.py survives
await page.locator('.nx-editor-tab:has-text("main.py")').first().click(); await page.waitForTimeout(400);
const bulkAccept = (d) => d.accept().catch(() => {});
page.on('dialog', bulkAccept);
await page.locator('.nx-tab-menu-btn').first().click(); await page.waitForTimeout(400);
await page.locator('.nx-dropdown-item', { hasText: 'Close Other Tabs' }).first().click(); await page.waitForTimeout(900);
page.off('dialog', bulkAccept);
const acceptTabs = await page.evaluate(() => [...document.querySelectorAll('.nx-editor-tab .nx-tab-title')].map((x) => x.textContent));
report('TABS_BULK_DIRTY_REAL', cancelTabs.length === 3 && readmeKept && cppKept && acceptTabs.length === 1 && acceptTabs[0] === 'main.py', JSON.stringify({ cancelTabs, readmeKept, cppKept, acceptTabs }));

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
const EXPECTED = ['CP_OFF_REAL','CLANGD_QUIET_PYTHON','SAVE_DISK','THEME_SWITCH_REAL','SESSION_RESTORE_REAL','REOPEN_PERSIST','THEME_PERSIST_REAL','SEARCH_REAL','SEARCH_OPEN_REAL','QUICKOPEN_REAL','SETTINGS_APPLY_REAL','TERMINAL_HOTKEY_REAL','TABS_CYCLE_REAL','TABS_MIDDLECLOSE_REAL','CRUMB_REVEAL_REAL','TABS_CLOSE_INACTIVE_REAL','TABS_CLOSE_ACTIVE_REAL','TABS_DIRTY_CANCEL_REAL','TERM_PTY','CLANGD_NOTICE_CPP','CREATE_FILE_REAL','RENAME_REAL','DELETE_REAL','TABS_CLOSE_OTHERS_REAL','TABS_CLOSE_RIGHT_REAL','TABS_CLOSE_RIGHT_MID_REAL','TABS_BULK_DIRTY_REAL','ZEN_REAL','CP_ON_REAL'];
const missing = EXPECTED.filter((n) => !(n in results));
const failed = EXPECTED.filter((n) => results[n] === false);
console.log('SUMMARY', JSON.stringify({ ok: EXPECTED.length - missing.length - failed.length, total: EXPECTED.length, missing, failed }));
if (missing.length || failed.length) { console.log('done WITH FAILURES'); process.exit(1); }
console.log('done');
