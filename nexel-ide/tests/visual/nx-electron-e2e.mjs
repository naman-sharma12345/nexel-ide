// Real-Electron verification of the workspace fs chain (no renderer mocks).
// Boots the actual packaged main process (main.cjs) against a dev server,
// then exercises window.nexelAPI fs methods end-to-end: real IPC, real worker, real disk.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-e2e-'));
const out = '/tmp/nxshots/electron';
fs.mkdirSync(out, { recursive: true });

const app = await electron.launch({
  args: ['.', '--no-sandbox'],
  env: { ...process.env, ELECTRON_START_URL: 'http://localhost:5173', ELECTRON_DISABLE_SANDBOX: '1' },
  timeout: 60000,
});
// main.cjs opens a DevTools window first in dev; pick the real app window.
let page;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  page = app.windows().find(w => w.url().startsWith('http://localhost:5173'));
  if (page) break;
  await new Promise(r => setTimeout(r, 500));
}
if (!page) throw new Error('app window not found');
await page.waitForFunction(() => window.nexelAPI !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: out + '/e1-boot.png' });

const api = (expr) => page.evaluate(expr);

// 1. Empty dir reads as empty through the REAL main-process worker
const empty = await api(`window.nexelAPI.readWorkspaceFiles(${JSON.stringify(tmp)})`);
console.log('empty read:', JSON.stringify(empty));

// 2. Create a file and a folder at the root through REAL IPC + fs
const f = await api(`window.nexelAPI.createFile(${JSON.stringify(tmp)}, 'solve.cpp')`);
const g = await api(`window.nexelAPI.createFolder(${JSON.stringify(tmp)}, 'stress')`);
console.log('created:', f, '|', g);
console.log('on disk:', fs.existsSync(path.join(tmp, 'solve.cpp')), fs.existsSync(path.join(tmp, 'stress')));

// 3. Re-read lists both entries through the REAL worker
const tree = await api(`window.nexelAPI.readWorkspaceFiles(${JSON.stringify(tmp)})`);
console.log('tree after create:', JSON.stringify(tree.map(n => n.name + ':' + n.type)));

// 4. Traversal is blocked through REAL IPC
try {
  await api(`window.nexelAPI.createFile(${JSON.stringify(tmp)}, '../evil.txt')`);
  console.log('traversal: NOT BLOCKED (bad)');
} catch (e) {
  console.log('traversal blocked:', e.message.slice(0, 80));
}

// 5. Open the workspace in the real UI by calling the store the way openRecent does
await page.evaluate((dir) => {
  const raw = window.nexelAPI.getStoreSync('nexel-workspace-store');
  const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 };
  parsed.state.rootPath = dir; parsed.state.rootName = 'NX-E2E'; parsed.state.activeDir = dir;
  window.nexelAPI.setStoreSync('nexel-workspace-store', JSON.stringify(parsed));
}, tmp);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.screenshot({ path: out + '/e2-workspace.png' });

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('E2E DONE');
