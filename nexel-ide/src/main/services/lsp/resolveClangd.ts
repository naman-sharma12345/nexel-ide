import path from 'node:path';
import fs from 'node:fs';

export interface ResolveEnv { platform: string; arch: string; resourcesPath?: string; appRoot: string; pathEnv?: string; exists?: (p: string) => boolean; }

export function platformKey(platform: string, arch: string) {
  const p = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  return `${p}-${arch}`;
}

/** Order: bundled (packaged) -> repo resources (dev) -> user override -> clangd on PATH -> null (Monaco fallback). */
export function resolveClangd(env: ResolveEnv, override?: string): { path: string; source: 'override' | 'bundled' | 'dev' | 'path' } | null {
  const exists = env.exists ?? ((p: string) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  const exe = env.platform === 'win32' ? 'clangd.exe' : 'clangd';
  const rel = path.join('clangd', platformKey(env.platform, env.arch), 'bin', exe);
  if (override && path.isAbsolute(override) && exists(override)) return { path: override, source: 'override' };
  if (env.resourcesPath) { const p = path.join(env.resourcesPath, rel); if (exists(p)) return { path: p, source: 'bundled' }; }
  const dev = path.join(env.appRoot, 'resources', rel); if (exists(dev)) return { path: dev, source: 'dev' };
  const sep = env.platform === 'win32' ? ';' : ':';
  for (const dir of (env.pathEnv ?? '').split(sep).filter(Boolean)) { const p = path.join(dir, exe); if (exists(p)) return { path: p, source: 'path' }; }
  return null;
}

export function clangdArgs() {
  return ['--background-index', '--clang-tidy=false', '--header-insertion=never', '--completion-style=detailed', '--pch-storage=memory', '-j=2', '--log=error'];
}

/** compile_flags.txt content for single-file CP workspaces (bits/stdc++.h shim via -I on clang without libstdc++). */
export function compileFlags(std = 'c++17', includeDir?: string) {
  return ['-xc++', `-std=${std}`, '-Wall', ...(includeDir ? [`-I${includeDir}`] : [])].join('\n') + '\n';
}
