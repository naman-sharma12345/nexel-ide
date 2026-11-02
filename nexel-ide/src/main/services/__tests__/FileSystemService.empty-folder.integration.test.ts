// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

import { FileSystemService } from '../FileSystemService';
// buildFileTree is the exact function the readFiles worker runs; calling it
// directly keeps this test on the real fs without spawning a Worker under vitest.
import { buildFileTree } from '../FileTreeWorker';

let dir: string | null = null;
afterEach(async () => {
  if (dir) { await fs.rm(dir, { recursive: true, force: true }); dir = null; }
});

async function listRoot(root: string) {
  const raw = await fs.readdir(root);
  const children = await Promise.all(raw.map(n => buildFileTree(path.join(root, n))));
  children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
  return children;
}

describe('FileSystemService against the real filesystem (empty folder flow)', () => {
  it('an empty dir lists no entries, then created files and folders appear', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nx-fs-'));
    const svc = new FileSystemService();

    // Empty workspace folder lists as empty, not an error.
    expect(await listRoot(dir)).toEqual([]);

    // Create at the workspace root, exactly what the Explorer empty-state flow calls.
    const filePath = await svc.createFile(dir, 'solve.cpp');
    const folderPath = await svc.createFolder(dir, 'stress');
    await svc.createFile(folderPath, 'gen.cpp');
    await svc.writeFileContent(filePath, '// hello\n');

    const tree = await listRoot(dir);
    const byName = new Map(tree.map(n => [n.name, n]));
    expect([...byName.keys()].sort()).toEqual(['solve.cpp', 'stress']);
    expect(byName.get('solve.cpp')!.type).toBe('file');
    expect(byName.get('stress')!.type).toBe('folder');
    expect((byName.get('stress')!.children ?? []).map(c => c.name)).toContain('gen.cpp');
    expect(await svc.readFileContent(filePath)).toBe('// hello\n');

    // Reopen persistence: a completely fresh read from disk lists the same entries.
    const fresh = await listRoot(dir);
    expect(fresh.map(n => n.name).sort()).toEqual(['solve.cpp', 'stress']);
  });

  it('duplicate New File rejects without changing existing disk content', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nx-fs-'));
    const svc = new FileSystemService();
    const file = await svc.createFile(dir, 'existing.txt');
    await fs.writeFile(file, 'keep this content\n');
    await expect(svc.createFile(dir, 'existing.txt')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readFile(file, 'utf8')).toBe('keep this content\n');
  });

  it('blocks traversal, rejects invalid names, and deleteNode removes entries', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nx-fs-'));
    const svc = new FileSystemService();

    await expect(svc.createFile(dir, '../evil.txt')).rejects.toThrow(/traversal/i);
    await expect(svc.createFolder(dir, '../../evil')).rejects.toThrow(/traversal/i);
    await expect(svc.createFile(dir, 'bad\0name')).rejects.toThrow();

    const keep = await svc.createFile(dir, 'keep.txt');
    expect((await listRoot(dir)).map(n => n.name)).toEqual(['keep.txt']);
    await svc.deleteNode(keep);
    expect(await listRoot(dir)).toEqual([]);
  });
});
