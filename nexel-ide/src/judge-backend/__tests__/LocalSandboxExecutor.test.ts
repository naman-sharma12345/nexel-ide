import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn, execSync } from 'child_process';
import { LocalSandboxExecutor } from '../LocalSandboxExecutor';
import { EventEmitter } from 'events';

vi.mock('child_process', () => {
  const mockExports = {
    spawn: vi.fn(),
    exec: vi.fn((_cmd: string, cb: any) => {
      if (typeof cb === 'function') {
        cb(null, '999 K', '');
      }
    }),
    execSync: vi.fn(),
  };
  return {
    ...mockExports,
    default: mockExports,
  };
});

describe('LocalSandboxExecutor security logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies checkBwrapAvailability detects and caches bwrap presence', () => {
    const executor = new LocalSandboxExecutor();
    const mockExecSync = execSync as any;

    // Simulate success (bwrap is available)
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/bwrap'));
    
    // Call private method (or execute which triggers it)
    const available = (executor as any).checkBwrapAvailability();
    expect(available).toBe(true);
    expect(mockExecSync).toHaveBeenCalled();

    // Call again -> should return cached value without invoking execSync again
    mockExecSync.mockClear();
    const cachedAvailable = (executor as any).checkBwrapAvailability();
    expect(cachedAvailable).toBe(true);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('verifies checkBwrapAvailability falls back and logs a warning on failure', () => {
    // Force platform to linux so console warnings are triggered
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    
    const executor = new LocalSandboxExecutor();
    const mockExecSync = execSync as any;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Simulate failure (bwrap is not installed)
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const available = (executor as any).checkBwrapAvailability();
    expect(available).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('verifies bwrap spawn configuration argument structures', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const executor = new LocalSandboxExecutor();
    (executor as any).hasBwrap = true; // Hardcode detection success

    const mockSpawn = spawn as any;
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = { write: vi.fn(), end: vi.fn() };
    mockProc.pid = 999;
    
    mockSpawn.mockReturnValue(mockProc);

    const runPromise = executor.execute({
      executablePath: 'C:/project/solution.exe',
      extension: '.cpp',
      input: '5\n',
      timeLimitMs: 2000,
      memoryLimitMb: 256
    });

    // Simulate process termination
    setTimeout(() => {
      mockProc.emit('close', 0, null);
    }, 10);

    await runPromise;

    expect(mockSpawn).toHaveBeenCalled();
    const [command, args] = mockSpawn.mock.calls[0];
    expect(command).toBe('bwrap');
    expect(args).toContain('--unshare-all');
    expect(args).toContain('--uid');
    expect(args).toContain('1000');
    expect(args).toContain('--gid');
    expect(args).toContain('1000');
    expect(args).toContain('--timeout');
    expect(args).toContain('2000');
  });

  it('verifies stdout exceeding 5MB is aggressively truncated and returns RE', async () => {
    const executor = new LocalSandboxExecutor();
    (executor as any).hasBwrap = false; // Fallback to basic spawn

    const mockSpawn = spawn as any;
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = { write: vi.fn(), end: vi.fn() };
    mockProc.pid = 999;
    mockProc.kill = vi.fn();
    
    mockSpawn.mockReturnValue(mockProc);

    const runPromise = executor.execute({
      executablePath: 'C:/project/solution.exe',
      extension: '.cpp',
      input: '5\n',
      timeLimitMs: 2000,
      memoryLimitMb: 256
    });

    // Send a massive chunk (exceeding 5MB)
    const massiveChunk = Buffer.alloc(6 * 1024 * 1024); // 6MB
    mockProc.stdout.emit('data', massiveChunk);

    const result = await runPromise;

    expect(result.verdict).toBe('RE');
    expect(result.stdout).toContain('[TRUNCATED - EXCEEDED 5MB LIMIT]');
  });
});
