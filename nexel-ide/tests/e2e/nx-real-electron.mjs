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
console.log('CP_OFF_REAL', JSON.stringify(cpOff), !cpOff.judgeNav && !cpOff.contestsNav && !cpOff.cpSnippetsBtn ? 'OK' : 'FAIL');
// clangd must stay silent for a Python-only session: no missing-binary toast.
await page.waitForTimeout(6000);
const toastPy = await page.evaluate(() => [...document.querySelectorAll('.tz-toast')].map((t) => t.textContent));
console.log('CLANGD_QUIET_PYTHON', toastPy.some((t) => (t ?? '').includes('clangd')) ? 'FAIL ' + JSON.stringify(toastPy) : 'OK');
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
console.log('SAVE_DISK', disk === expected ? 'OK' : 'MISMATCH', 'autosave_was', autoSave, disk === expected ? '' : JSON.stringify(disk));
await page.screenshot({ path: dir + '/r3-saved.png' });


await new Promise(r => setTimeout(r, 1500));

// --- Phase 2: reopen in a fresh process, verify persistence ---
({ app, page } = await boot());
await page.locator('.nx-node-row:has-text("src")').first().click({ timeout: 15000 }); await page.waitForTimeout(700);
await page.locator('.nx-node-row:has-text("main.py")').first().click({ timeout: 15000 }); await page.waitForTimeout(1800);
const reopened = await page.evaluate(() => document.querySelector('.view-lines')?.textContent ?? '');
console.log('REOPEN_PERSIST', reopened.includes('edit-mark-123') ? 'OK' : 'MISSING');

// --- Phase 3: real PTY terminal lifecycle ---
await page.click('.sb-bar >> text=Terminal');
await page.waitForTimeout(3500);
const termArea = page.locator('.nx-terminal-panel .xterm, .nx-terminal-panel').first();
await termArea.click().catch(() => {});
await page.keyboard.type('echo NX$((20+22))');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const termText = await page.evaluate(() => document.querySelector('.xterm-rows')?.textContent ?? '');
console.log('TERM_PTY', termText.includes('NX42') ? 'OK' : 'MISSING', JSON.stringify(termText.slice(-120)));
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
console.log('CLANGD_NOTICE_CPP', toastHit && chipHit ? 'OK' : 'MISSING ' + JSON.stringify(cppEvidence));
await page.screenshot({ path: dir + '/r6-cpp-notice.png' });

// --- Phase 3c: real file creation through the explorer header ---
await page.locator('button.nx-action-btn[title="New File"]').first().click({ timeout: 15000 });
await page.waitForTimeout(800);
await page.locator('.nx-inline-input-wrapper input').first().fill('notes.txt');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const createdRow = await page.evaluate(() => [...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('notes.txt')));
const createdDisk = fs.existsSync(ws + '/src/notes.txt') && fs.readFileSync(ws + '/src/notes.txt', 'utf8') === '';
console.log('CREATE_FILE_REAL', createdRow && createdDisk ? 'OK' : 'FAIL row=' + createdRow + ' disk=' + createdDisk);
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
console.log('RENAME_REAL', renamedOk && renamedRow ? 'OK' : 'FAIL disk=' + renamedOk + ' row=' + renamedRow);

page.on('dialog', (d) => d.accept());
await page.locator('.nx-node-row:has-text("todo.txt")').first().click({ button: 'right', timeout: 15000 });
await page.waitForTimeout(600);
await page.locator('.nx-context-item:has-text("Delete")').first().click({ timeout: 10000 });
await page.waitForTimeout(1200);
const deletedOk = !fs.existsSync(ws + '/src/todo.txt');
const deletedRow = await page.evaluate(() => ![...document.querySelectorAll('.nx-node-row')].some((r) => r.textContent?.includes('todo.txt')));
console.log('DELETE_REAL', deletedOk && deletedRow ? 'OK' : 'FAIL disk=' + deletedOk + ' row=' + deletedRow);

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
console.log('CP_ON_REAL', JSON.stringify(cpOn), cpOn.judgeNav && cpOn.contestsNav ? 'OK' : 'FAIL');
await page.screenshot({ path: dir + '/r5-cp-on.png' });
await app.close();
console.log('done');
