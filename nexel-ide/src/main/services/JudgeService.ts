import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { LocalSandboxExecutor } from '../../judge-backend/LocalSandboxExecutor';

export interface TestCase {
  id: number;
  input: string;
  expected: string;
}

export interface JudgeResult {
  id: number;
  verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE';
  metrics: { time: number; memory: number; exitCode: number };
  actual: string;
  diff: string;
  expected?: string;
  passed?: boolean;
}

export interface Contest {
  id: number;
  name: string;
  type: string;
  phase: string;
  frozen: boolean;
  durationSeconds: number;
  startTimeSeconds: number;
  relativeTimeSeconds: number;
}

export interface ContestsData {
  active: Contest[];
  upcoming: Contest[];
  passed: Contest[];
}

const cleanLines = (str: string) => 
  (str || '').trim().split(/\r?\n/).map(line => line.trimEnd()).join('\n');

/**
 * JSDoc:
 * Orchestration service for compiling programs and running them via a Sandbox Executor.
 * 
 * To migrate to Docker/WebAssembly, create a new class implementing ISandboxExecutor,
 * inject/swap it in place of LocalSandboxExecutor here. No other changes required.
 */
export class JudgeService {
  private baseTempDir = path.join(os.tmpdir(), 'nexel-judge');

  private async createIsolatedWorkspace(): Promise<string> {
    const workspaceId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const workspaceDir = path.join(this.baseTempDir, workspaceId);
    await fs.mkdir(workspaceDir, { recursive: true });
    return workspaceDir;
  }

  private async cleanupWorkspace(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Warning: failed to clean up judge workspace at ${dir}:`, e);
    }
  }

  private compileCpp(src: string, dest: string, compileTimeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const gpp = spawn('g++', ['-std=c++17', src, '-o', dest]);
      let errData = '';
      
      const timer = setTimeout(() => {
        gpp.kill('SIGKILL');
        reject(new Error(`Compilation timed out after ${compileTimeout}ms`));
      }, compileTimeout);

      gpp.stderr.on('data', data => { errData += data.toString(); });
      gpp.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(errData || `Compilation failed with exit code ${code}`));
      });
    });
  }

  private compileJava(src: string, destDir: string, compileTimeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const javac = spawn('javac', ['-d', destDir, src]);
      let errData = '';

      const timer = setTimeout(() => {
        javac.kill('SIGKILL');
        reject(new Error(`Java compilation timed out after ${compileTimeout}ms`));
      }, compileTimeout);

      javac.stderr.on('data', data => { errData += data.toString(); });
      javac.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(errData || `Java compilation failed with exit code ${code}`));
      });
    });
  }

  async run(filePath: string, testCases: TestCase[], timeLimit: number, memoryLimit: number): Promise<JudgeResult[]> {
    const isWin = process.platform === 'win32';
    const workspaceDir = await this.createIsolatedWorkspace();
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    
    let executablePath = filePath;
    let runClassName = baseName;
    let compileError: string | null = null;

    // Phase 1: Compilation Phase
    try {
      if (ext === '.cpp' || ext === '.cc') {
        const outBinName = isWin ? `${baseName}.exe` : baseName;
        const outExe = path.join(workspaceDir, outBinName);
        await this.compileCpp(filePath, outExe, 15000);
        executablePath = outExe;
      } else if (ext === '.java') {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const classMatch = content.match(/public\s+class\s+(\w+)/);
          if (classMatch) {
            runClassName = classMatch[1];
          }
        } catch (e) {}

        const copiedJavaFile = path.join(workspaceDir, `${runClassName}.java`);
        await fs.copyFile(filePath, copiedJavaFile);
        await this.compileJava(copiedJavaFile, workspaceDir, 15000);
        executablePath = workspaceDir; 
      }
    } catch (err: any) {
      compileError = err.message || String(err);
    }

    if (compileError) {
      await this.cleanupWorkspace(workspaceDir);
      return testCases.map(tc => ({
        id: tc.id,
        verdict: 'RE',
        metrics: { time: 0, memory: 0.1, exitCode: 1 },
        actual: compileError || '',
        diff: `Compilation Error:\n${compileError}`
      }));
    }

    // Phase 2: Execution Phase via Sandbox
    const sandbox = new LocalSandboxExecutor();
    const results: JudgeResult[] = [];

    for (const tc of testCases) {
      const sandboxRes = await sandbox.execute({
        executablePath,
        extension: ext,
        javaClassName: runClassName,
        input: tc.input,
        timeLimitMs: timeLimit,
        memoryLimitMb: memoryLimit
      });

      const normalizedActual = cleanLines(sandboxRes.stdout);
      const normalizedExpected = cleanLines(tc.expected);
      const passed = sandboxRes.verdict === 'AC' && normalizedActual === normalizedExpected;

      results.push({
        id: tc.id,
        verdict: passed ? 'AC' : (sandboxRes.verdict === 'AC' ? 'WA' : sandboxRes.verdict),
        metrics: {
          time: sandboxRes.timeMs,
          memory: sandboxRes.memoryMb,
          exitCode: sandboxRes.exitCode ?? 1
        },
        actual: sandboxRes.stdout,
        diff: sandboxRes.stderr || (passed ? '' : `Expected:\n${tc.expected}\n\nActual:\n${sandboxRes.stdout}`),
        expected: tc.expected,
        passed
      });
    }

    // Clean up temporary workspace directory
    await this.cleanupWorkspace(workspaceDir);
    return results;
  }

  private contestsCache: { at: number; data: ContestsData } | null = null;

  async fetchContests(): Promise<ContestsData> {
    // TTL cache (5 min) avoids hammering the API; stale data served if network fails.
    if (this.contestsCache && Date.now() - this.contestsCache.at < 300_000) return this.contestsCache.data;
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 8000);
          try {
            response = await fetch('https://codeforces.com/api/contest.list?gym=false', { signal: ctl.signal });
          } finally { clearTimeout(timer); }
          if (response.ok) break;
        } catch (e) {
          if (attempt === 2) throw e;
        }
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt)); // exponential backoff
      }
      if (!response || !response.ok) {
        throw new Error(`HTTP error! status: ${response?.status}`);
      }
      const data = (await response.json()) as { status: string; comment?: string; result: Contest[] };
      if (data.status !== 'OK') {
        throw new Error(`API error: ${data.comment || 'Unknown error'}`);
      }
      const contests = data.result;
      const active = contests.filter((c: Contest) => c.phase === 'CODING');
      const passed = contests
        .filter((c: Contest) => c.phase === 'FINISHED')
        .sort((a: Contest, b: Contest) => b.startTimeSeconds - a.startTimeSeconds)
        .slice(0, 2);
      const upcomingCount = active.length > 0 ? 2 : 3;
      const upcoming = contests
        .filter((c: Contest) => c.phase === 'BEFORE')
        .sort((a: Contest, b: Contest) => a.startTimeSeconds - b.startTimeSeconds)
        .slice(0, upcomingCount);

      const result = { active, upcoming, passed };
      this.contestsCache = { at: Date.now(), data: result };
      return result;
    } catch (err) {
      console.error("Failed to fetch contests in main process:", err);
      if (this.contestsCache) return this.contestsCache.data;
      throw err;
    }
  }

  async fetchProblems(contestId: number): Promise<unknown> {
    try {
      const nexelJudgeDir = path.resolve(__dirname, '../../../../nexel-judge');
      const outFile = path.join(nexelJudgeDir, `questions_${contestId}.json`);

      return new Promise((resolve, reject) => {
        const scriptPath = path.join(nexelJudgeDir, 'cf_problems.js');
        const child = spawn('node', [scriptPath, contestId.toString()], {
          cwd: nexelJudgeDir,
          env: {
            ...process.env,
            NON_INTERACTIVE: 'true'
          }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', data => { stdout += (data as Buffer).toString(); });
        child.stderr.on('data', data => { stderr += (data as Buffer).toString(); });

        child.on('close', async (code) => {
          if (code === 0) {
            try {
              const fileContent = await fs.readFile(outFile, 'utf8');
              resolve(JSON.parse(fileContent));
              fs.unlink(outFile).catch(err => console.error("Failed to delete temp problems file:", err));
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              reject(new Error(`Failed to read output file: ${message}`));
            }
          } else {
            reject(new Error(stderr || stdout || `Scraper exited with code ${code}`));
          }
        });

        child.on('error', err => {
          reject(new Error(`Failed to start scraper process: ${err.message}`));
        });
      });
    } catch (err) {
      console.error("Failed to fetch contest problems:", err);
      throw err;
    }
  }
}
