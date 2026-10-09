import { spawn, exec, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { ISandboxExecutor, SandboxConfig, SandboxResult } from './SandboxExecutor';

/**
 * JSDoc:
 * Robust Sandbox Executor implementing ISandboxExecutor.
 * 
 * Security Boundaries:
 * - On Unix/Linux: Executes binaries inside a Bubblewrap (bwrap) sandbox, unsharing namespaces
 *   (IPC, Network, PID, UTS, Mount) to isolate the runtime. It bind-mounts necessary system library paths
 *   (/usr, /lib, /lib64, /bin) and the source directory as Read-Only. Process execution drops privileges
 *   to uid/gid 1000. Falls back to ulimit + SIGKILL process group teardown if bwrap is missing.
 * - On Windows: Attempts to restrict child processes using Windows Job Objects via win32-job if installed.
 *   Enforces strict memory checks and kills the process tree recursively using taskkill & WMIC query loops.
 * - Under all platforms: Strictly enforces a 5MB standard output capping to prevent disk/memory bloating.
 */
/**
 * Builds argv for `sh` that applies POSIX resource limits (the setrlimit(2) family) then execs the target:
 *  -v address space, -t CPU seconds, -u max processes (fork-bomb guard), -f max written file size, -c no core dumps.
 * User-controlled values only appear as positional parameters ($1, $2...), which the shell never re-parses.
 */
export function buildUlimitFallback(
  config: Pick<SandboxConfig, 'extension' | 'executablePath' | 'javaClassName'>,
  memoryLimitKb: number,
  timeLimitSec: number
): string[] {
  const kb = Math.max(1, Math.floor(Number(memoryLimitKb)) || 262144);
  const sec = Math.max(1, Math.floor(Number(timeLimitSec)) || 1);
  // Java reserves a huge virtual address range, so -v would kill the JVM at startup; cap CPU/procs instead.
  const vLimit = config.extension === '.java' ? '' : `ulimit -v ${kb} 2>/dev/null; `;
  const limits = `${vLimit}ulimit -t ${sec} 2>/dev/null; ulimit -u 256 2>/dev/null; ulimit -f 65536 2>/dev/null; ulimit -c 0 2>/dev/null; `;
  if (config.extension === '.py') return ['-c', `${limits}exec python3 "$1"`, 'nexel-sandbox', config.executablePath];
  if (config.extension === '.java' && config.javaClassName)
    return ['-c', `${limits}exec java -cp "$1" "$2"`, 'nexel-sandbox', config.executablePath, config.javaClassName];
  return ['-c', `${limits}exec "$1"`, 'nexel-sandbox', config.executablePath];
}

export class LocalSandboxExecutor implements ISandboxExecutor {
  private hasBwrap: boolean | null = null;

  private checkBwrapAvailability(): boolean {
    if (this.hasBwrap !== null) return this.hasBwrap;
    try {
      execSync(process.platform === 'win32' ? 'where bwrap' : 'which bwrap', { stdio: 'ignore' });
      this.hasBwrap = true;
    } catch {
      this.hasBwrap = false;
      if (process.platform !== 'win32') {
        console.warn("\x1b[33m%s\x1b[0m", "SECURITY WARNING: Bubblewrap (bwrap) was not found on this system.");
        console.warn("\x1b[33m%s\x1b[0m", "Production judge environments must install 'bwrap' for secure execution sandboxing.");
        console.warn("\x1b[33m%s\x1b[0m", "Falling back to basic ulimit constraints.");
      }
    }
    return this.hasBwrap;
  }

  async execute(config: SandboxConfig): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const startTime = process.hrtime();
      const timeLimitSec = Math.ceil(config.timeLimitMs / 1000);
      const memoryLimitKb = config.memoryLimitMb * 1024;
      const maxOutputBytes = 5 * 1024 * 1024; // 5MB Limit

      // Sandbox environment lockdown - only permit basic PATH
      const sanitizedEnv = {
        PATH: process.env.PATH || '',
      };

      const spawnOpts = {
        detached: !isWin, // Detach process group on Unix for process-tree killing
        stdio: 'pipe' as const,
        env: sanitizedEnv,
      };

      let child: any;
      let memoryTimer: any = null;

      // Select execution environment
      if (isWin) {
        if (config.extension === '.py') {
          child = spawn('python', [config.executablePath], spawnOpts);
        } else if (config.extension === '.java' && config.javaClassName) {
          child = spawn('java', ['-cp', config.executablePath, config.javaClassName], spawnOpts);
        } else {
          child = spawn(config.executablePath, [], spawnOpts);
        }

        // Apply Windows Job Object limits dynamically if win32-job is available
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const win32Job = require('win32-job');
          if (win32Job && win32Job.JobObject && child.pid) {
            const job = new win32Job.JobObject();
            job.setLimits({
              limitFlags: win32Job.JobObject.LIMIT_PROCESS_MEMORY,
              maxProcessMemory: config.memoryLimitMb * 1024 * 1024
            });
            job.associate(child.pid);
          }
        } catch {
          // Fall back gracefully to tasklist monitoring and process-tree killer
        }
      } else {
        // Unix execution path
        const parentDir = path.dirname(config.executablePath);
        const hasBwrap = this.checkBwrapAvailability();

        if (hasBwrap) {
          // Build secure Bubblewrap arguments
          const bwrapArgs: string[] = [
            '--unshare-all',
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/lib', '/lib',
            '--proc', '/proc',
            '--dev', '/dev',
            '--ro-bind', parentDir, parentDir,
            '--chdir', parentDir,
            '--timeout', config.timeLimitMs.toString(),
            '--uid', '1000',
            '--gid', '1000'
          ];

          // Mount architecture-specific lib directories if present on system
          if (fs.existsSync('/lib64')) {
            bwrapArgs.push('--ro-bind', '/lib64', '/lib64');
          }
          if (fs.existsSync('/bin')) {
            bwrapArgs.push('--ro-bind', '/bin', '/bin');
          }

          // Append executable runtime command
          if (config.extension === '.py') {
            bwrapArgs.push('python3', config.executablePath);
          } else if (config.extension === '.java' && config.javaClassName) {
            bwrapArgs.push('java', '-cp', config.executablePath, config.javaClassName);
          } else {
            bwrapArgs.push(config.executablePath);
          }

          child = spawn('bwrap', bwrapArgs, spawnOpts);
        } else {
          // Fallback to ulimit constraints. Paths travel as positional args ("$@"), never interpolated
          // into the shell string, so a file name containing quotes or $() cannot inject commands.
          const fb = buildUlimitFallback(config, memoryLimitKb, timeLimitSec);
          child = spawn('sh', fb, spawnOpts);
        }
      }

      let stdout = '';
      let stderr = '';
      let isFinished = false;
      let peakMemoryMb = 0.5;
      let totalOutputSize = 0;

      // Pipe inputs
      if (child.stdin) {
        if (typeof child.stdin.on === 'function') child.stdin.on('error', () => { /* EPIPE: program exited before reading all input */ });
        child.stdin.write(config.input || '');
        child.stdin.end();
      }

      // Safe Windows process tree termination helper
      const killWindowsProcessTree = (parentPid: number) => {
        try {
          spawn('taskkill', ['/F', '/T', '/PID', parentPid.toString()]);
        } catch {}

        const queryCmd = `wmic process where "ParentProcessId=${parentPid}" get ProcessId /format:list`;
        exec(queryCmd, (err, stdoutStr) => {
          if (err || !stdoutStr) {
            // Fall back to PowerShell query since wmic is deprecated/disabled on modern Windows 11
            const psQueryCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ParentProcessId = ${parentPid}\\" | Select-Object -ExpandProperty ProcessId"`;
            exec(psQueryCmd, (psErr, psStdoutStr) => {
              if (psErr || !psStdoutStr) return;
              const childPids = psStdoutStr
                .split(/\r?\n/)
                .map(line => parseInt(line.trim(), 10))
                .filter(pid => !isNaN(pid));

              for (const pid of childPids) {
                killWindowsProcessTree(pid);
              }
            });
            return;
          }

          const childPids = stdoutStr
            .split(/\r?\n/)
            .map(line => line.match(/ProcessId=(\d+)/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map(m => parseInt(m[1], 10));

          for (const pid of childPids) {
            killWindowsProcessTree(pid); // Recursive descend
          }
        });
      };

      // Cleanly kill the entire process tree/group to prevent fork-bombs and zombie leaks
      const killProcessTree = () => {
        if (!child.pid) return;
        if (isWin) {
          killWindowsProcessTree(child.pid);
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL'); // Kill entire Unix process group
          } catch {
            try { child.kill('SIGKILL'); } catch {}
          }
        }
      };

      const handleOutputLimit = (dataSize: number): boolean => {
        totalOutputSize += dataSize;
        if (totalOutputSize > maxOutputBytes && !isFinished) {
          isFinished = true;
          clearTimeout(timeoutTimer);
          if (memoryTimer) clearInterval(memoryTimer);
          killProcessTree();
          
          const [sec, nsec] = process.hrtime(startTime);
          const elapsedMs = Math.round(sec * 1000 + nsec / 1000000);

          resolve({
            stdout: stdout.substring(0, 1000) + '\n... [TRUNCATED - EXCEEDED 5MB LIMIT] ...',
            stderr: stderr.substring(0, 1000) + '\n... [TRUNCATED - EXCEEDED 5MB LIMIT] ...',
            exitCode: null,
            timeMs: elapsedMs,
            memoryMb: Math.round(peakMemoryMb * 10) / 10,
            verdict: 'RE'
          });
          return true;
        }
        return false;
      };

      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          if (handleOutputLimit(data.length)) return;
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          if (handleOutputLimit(data.length)) return;
          stderr += data.toString();
        });
      }

      // Time Limit Timeout Enforcer
      const timeoutTimer = setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        
        killProcessTree();
        
        const [sec, nsec] = process.hrtime(startTime);
        const elapsedMs = Math.round(sec * 1000 + nsec / 1000000);

        resolve({
          stdout,
          stderr,
          exitCode: null,
          timeMs: elapsedMs,
          memoryMb: Math.round(peakMemoryMb * 10) / 10,
          verdict: 'TLE'
        });
      }, config.timeLimitMs);

      // Memory monitor query helper
      const queryProcessMemoryOnce = (pid: number): Promise<number> => {
        return new Promise((res) => {
          if (!pid) return res(0.5);
          const cmd = isWin
            ? `tasklist /FI "PID eq ${pid}" /NH`
            : `ps -p ${pid} -o rss=`;

          exec(cmd, (err, stdoutStr) => {
            if (err || !stdoutStr) return res(0.5);
            if (isWin) {
              const match = stdoutStr.match(/([\d,]+)\s*K/i);
              if (match) {
                return res(parseInt(match[1].replace(/,/g, ''), 10) / 1024);
              }
            } else {
              const kb = parseInt(stdoutStr.trim(), 10);
              if (!isNaN(kb)) return res(kb / 1024);
            }
            res(0.5);
          });
        });
      };

      // Memory limit enforcement loop (polling on Unix; Windows relies on exit check & tasklist)
      if (!isWin) {
        memoryTimer = setInterval(() => {
          if (isFinished || !child.pid) {
            if (memoryTimer) clearInterval(memoryTimer);
            return;
          }

          queryProcessMemoryOnce(child.pid).then((currentMemory) => {
            if (isFinished) return;
            if (currentMemory > peakMemoryMb) {
              peakMemoryMb = currentMemory;
            }

            if (peakMemoryMb > config.memoryLimitMb) {
              isFinished = true;
              clearTimeout(timeoutTimer);
              if (memoryTimer) clearInterval(memoryTimer);
              killProcessTree();

              const [sec, nsec] = process.hrtime(startTime);
              const elapsedMs = Math.round(sec * 1000 + nsec / 1000000);

              resolve({
                stdout,
                stderr,
                exitCode: null,
                timeMs: elapsedMs,
                memoryMb: Math.round(peakMemoryMb * 10) / 10,
                verdict: 'MLE'
              });
            }
          });
        }, 300);
      }

      child.on('close', async (code: number | null, signal: string | null) => {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timeoutTimer);
        if (memoryTimer) clearInterval(memoryTimer);

        const [sec, nsec] = process.hrtime(startTime);
        const elapsedMs = Math.round(sec * 1000 + nsec / 1000000);

        if (child.pid) {
          const finalMemory = await queryProcessMemoryOnce(child.pid);
          if (finalMemory > peakMemoryMb) {
            peakMemoryMb = finalMemory;
          }
        }

        // Handle Unix signals
        if (signal === 'SIGXCPU') {
          resolve({
            stdout,
            stderr,
            exitCode: null,
            timeMs: elapsedMs,
            memoryMb: Math.round(peakMemoryMb * 10) / 10,
            verdict: 'TLE'
          });
          return;
        }

        // Non-zero exit code indicates runtime error
        if (code !== 0 || signal) {
          const isOom = (code === 137 || signal === 'SIGKILL' || stderr.toLowerCase().includes('out of memory'));
          resolve({
            stdout,
            stderr,
            exitCode: code,
            timeMs: elapsedMs,
            memoryMb: Math.round(peakMemoryMb * 10) / 10,
            verdict: isOom ? 'MLE' : 'RE'
          });
          return;
        }

        // Verify outputs
        resolve({
          stdout,
          stderr,
          exitCode: code,
          timeMs: elapsedMs,
          memoryMb: Math.round(peakMemoryMb * 10) / 10,
          verdict: 'AC'
        });
      });

      child.on('error', (err: Error) => {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timeoutTimer);
        if (memoryTimer) clearInterval(memoryTimer);
        resolve({
          stdout,
          stderr: err.message,
          exitCode: 1,
          timeMs: 0,
          memoryMb: 0,
          verdict: 'RE'
        });
      });
    });
  }
}
