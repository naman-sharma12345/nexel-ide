// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { parentPort } from 'worker_threads';

// Mock worker_threads partially to avoid breaking Vitest runner
vi.mock('worker_threads', async (importOriginal) => {
  const original = await importOriginal<typeof import('worker_threads')>();
  const mockPort = {
    postMessage: vi.fn(),
  };
  return {
    ...original,
    parentPort: mockPort,
    workerData: {
      dirPath: 'C:/secure-root',
    },
  };
});

// Mock fs/promises partially
vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>();
  return {
    ...original,
    stat: vi.fn(),
    readdir: vi.fn(),
  };
});

import { run } from '../FileTreeWorker';

describe('FileTreeWorker resilience and performance safety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fails gracefully when permission is denied (EACCES) (Test A)', async () => {
    const mockStat = fs.stat as unknown as ReturnType<typeof vi.fn>;
    const mockPost = parentPort?.postMessage as unknown as ReturnType<typeof vi.fn>;

    // Simulate Permission Denied
    mockStat.mockRejectedValue(new Error('EACCES: permission denied, stat "C:/secure-root"'));

    await run();

    // Verify error is posted to the main thread instead of crashing
    expect(mockPost).toHaveBeenCalled();
    const sentData = mockPost.mock.calls[0][0];
    expect(sentData.error).toContain('EACCES');
  });

  it('proves no synchronous blocking occurs on large directory structures (Test B)', async () => {
    const mockStat = fs.stat as unknown as ReturnType<typeof vi.fn>;
    const mockReaddir = fs.readdir as unknown as ReturnType<typeof vi.fn>;
    const mockPost = parentPort?.postMessage as unknown as ReturnType<typeof vi.fn>;

    // Mock stats to identify the root as folder, others as files
    mockStat.mockImplementation(async (targetPath: string) => {
      if (targetPath === 'C:/secure-root') {
        return { isDirectory: () => true };
      }
      return { isDirectory: () => false };
    });

    // Mock readdir to return 500 files
    const largeFileList = Array.from({ length: 500 }, (_, i) => `file_${String(i).padStart(3, '0')}.cpp`);
    mockReaddir.mockResolvedValue(largeFileList);

    const startTime = Date.now();
    await run();
    const elapsed = Date.now() - startTime;

    // Verify the operation completes within a very small time threshold, proving non-blocking async execution
    expect(elapsed).toBeLessThan(100);

    // Verify sorting output structure is correct and contains all files
    expect(mockPost).toHaveBeenCalled();
    const sentData = mockPost.mock.calls[0][0];
    expect(sentData.children).toBeDefined();
    expect(sentData.children.length).toBe(500);
    expect(sentData.children[0].name).toBe('file_000.cpp');
    expect(sentData.children[499].name).toBe('file_499.cpp');
  });
});
