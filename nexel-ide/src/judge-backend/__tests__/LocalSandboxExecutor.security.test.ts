import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { LocalSandboxExecutor } from '../LocalSandboxExecutor';
import { EventEmitter } from 'events';

// Create a custom type for the mock process to be type-safe
interface MockProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  pid: number;
  kill: ReturnType<typeof vi.fn>;
}

vi.mock('child_process', () => {
  const mockExports = {
    spawn: vi.fn(),
    exec: vi.fn((_cmd: string, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
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

describe('LocalSandboxExecutor security robustness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('proves the sandbox enforces standard output cap of 5MB aggressively (Test A)', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('mock signal error');
    });

    const executor = new LocalSandboxExecutor();
    (executor as any).hasBwrap = false; // Bypass Bubblewrap detection to use raw spawn

    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    const mockProc = new EventEmitter() as unknown as MockProcess;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    mockProc.pid = 12345;
    mockProc.kill = vi.fn();

    mockSpawn.mockReturnValue(mockProc);

    const runPromise = executor.execute({
      executablePath: 'C:/project/malicious.exe',
      extension: '.cpp',
      input: '',
      timeLimitMs: 5000,
      memoryLimitMb: 256,
    });

    // Rapidly emit stdout chunks that exceed the 5MB ceiling (5 * 1024 * 1024 + 100 bytes)
    const chunkSize = 1024 * 1024; // 1MB
    const count = 6; // Total = 6MB, which exceeds the limit
    for (let i = 0; i < count; i++) {
      const buffer = Buffer.alloc(chunkSize, 'A');
      mockProc.stdout.emit('data', buffer);
    }

    const result = await runPromise;

    // Prove that process tree killer is triggered immediately
    expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.verdict).toBe('RE');
    expect(result.stdout).toContain('[TRUNCATED - EXCEEDED 5MB LIMIT]');

    killSpy.mockRestore();
  });

  it('proves process tree is terminated on timeout and returns TLE (Test B)', async () => {
    // Force platform to non-win32 to verify Unix signal invocation path
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    const executor = new LocalSandboxExecutor();
    (executor as any).hasBwrap = false;

    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    const mockProc = new EventEmitter() as unknown as MockProcess;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    mockProc.pid = 9999;
    mockProc.kill = vi.fn();

    mockSpawn.mockReturnValue(mockProc);

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      return true;
    });

    const runPromise = executor.execute({
      executablePath: 'C:/project/hangs.exe',
      extension: '.cpp',
      input: '',
      timeLimitMs: 3000,
      memoryLimitMb: 256,
    });

    // Advance timers past the time limit of 3000ms
    await vi.advanceTimersByTimeAsync(3500);

    const result = await runPromise;

    // Verify correct verdict and SIGKILL signaling to the process group
    expect(killSpy).toHaveBeenCalledWith(-9999, 'SIGKILL');
    expect(result.verdict).toBe('TLE');
    killSpy.mockRestore();
  });
});
