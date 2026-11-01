import path from 'node:path';
import fs from 'node:fs';

export interface ResolveEnv { platform: string; arch: string; resourcesPath?: string; appRoot: string; pathEnv?: string; exists?: (p: string) => boolean; }
export type ClangdSource = 'override' | 'bundled' | 'dev' | 'path';

export function platformKey(platform: string, arch: string) {
  const p = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  return `${p}-${arch}`;
}

/**
 * Folder names under resources/clangd/ that can serve this host, best first. Matches scripts/clangd-assets.mjs:
 * the official mac build is a universal binary (mac-universal) and Windows on ARM runs the x64 build under emulation.
 */
export function clangdDirCandidates(platform: string, arch: string): string[] {
  const exact = platformKey(platform, arch);
  if (platform === 'darwin') return [exact, 'mac-universal'];
  if (platform === 'win32') return arch === 'x64' ? [exact] : [exact, 'win-x64'];
  return [exact];
}

const isFile = (p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** Order: user override -> bundled (packaged) -> repo resources (dev) -> clangd on PATH -> null (Monaco fallback). */
export function resolveClangd(env: ResolveEnv, override?: string): { path: string; source: ClangdSource } | null {
  const exists = env.exists ?? isFile;
  const exe = env.platform === 'win32' ? 'clangd.exe' : 'clangd';
  const rels = clangdDirCandidates(env.platform, env.arch).map(d => path.join('clangd', d, 'bin', exe));
  if (override && path.isAbsolute(override) && exists(override)) return { path: override, source: 'override' };
  if (env.resourcesPath) for (const rel of rels) { const p = path.join(env.resourcesPath, rel); if (exists(p)) return { path: p, source: 'bundled' }; }
  for (const rel of rels) { const dev = path.join(env.appRoot, 'resources', rel); if (exists(dev)) return { path: dev, source: 'dev' }; }
  const found = findOnPath(exe, env);
  return found ? { path: found, source: 'path' } : null;
}

/** First absolute PATH entry containing `exe` (relative entries are skipped: they would resolve against the cwd). */
export function findOnPath(exe: string, env: Pick<ResolveEnv, 'platform' | 'pathEnv' | 'exists'>): string | null {
  const exists = env.exists ?? isFile;
  const sep = env.platform === 'win32' ? ';' : ':';
  const join = env.platform === 'win32' ? path.win32.join : path.posix.join;
  const abs = env.platform === 'win32' ? path.win32.isAbsolute : path.posix.isAbsolute;
  for (const dir of (env.pathEnv ?? '').split(sep).map(d => d.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)) {
    if (!abs(dir)) continue;
    const p = join(dir, exe); if (exists(p)) return p;
  }
  return null;
}

/**
 * The C++ compiler clangd should ask for system include paths (--query-driver). g++ first (libstdc++ ships
 * bits/stdc++.h, MinGW on Windows), then clang++ (Xcode command line tools on macOS).
 */
export function findCompiler(env: Pick<ResolveEnv, 'platform' | 'pathEnv' | 'exists'>): string | null {
  const names = env.platform === 'win32' ? ['g++.exe', 'clang++.exe'] : ['g++', 'clang++'];
  for (const n of names) { const p = findOnPath(n, env); if (p) return p; }
  return null;
}

/** Fixed clangd argv. The renderer never contributes to it; only main-process-resolved paths are added. */
export function clangdArgs(opts: { queryDriver?: string | null } = {}) {
  const args = ['--background-index', '--clang-tidy=false', '--header-insertion=never', '--completion-style=detailed',
    '--pch-storage=memory', '-j=2', '--log=error', '--limit-results=200'];
  if (opts.queryDriver && path.isAbsolute(opts.queryDriver) && !/[*?[\]{},]/.test(opts.queryDriver)) args.push(`--query-driver=${opts.queryDriver}`);
  return args;
}

/** compile_flags.txt content for single-file CP workspaces (kept for users who prefer it over .clangd). */
export function compileFlags(std = 'c++17', includeDir?: string) {
  return ['-xc++', `-std=${std}`, '-Wall', ...(includeDir ? [`-I${includeDir}`] : [])].join('\n') + '\n';
}
