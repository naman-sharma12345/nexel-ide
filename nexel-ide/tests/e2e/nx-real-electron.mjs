// Real Electron lifecycle harness: real main process, real node-pty, real fs.
// Isolation: XDG_CONFIG_HOME points at a disposable temp dir; nothing touches
// the user's persistent ~/.config/Nexel IDE.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
const dir = '/tmp/nxshots/real';
fs.mkdirSync(dir, { recursive: true });
const ws = '/tmp/nxreal-ws';
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

// --- Phase 1: open file, edit, save, verify on disk ---
let { app, page } = await boot();
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
console.log('SAVE_DISK', disk.includes('edit-mark-123') ? 'OK' : 'MISSING', 'autosave_was', autoSave);
await page.screenshot({ path: dir + '/r3-saved.png' });
await app.close();
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
await app.close();
console.log('done');
