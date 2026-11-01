import path from 'node:path';
import fs from 'node:fs';
import type { ClangdOptions } from './lspValidate';

/** First line of every .clangd Nexel writes. Only files carrying it are ever rewritten. */
export const GENERATED_MARKER = '# nexel:generated';

export interface ConfigFs { exists(p: string): boolean; read(p: string): string; write(p: string, s: string): void }
const nodeFs: ConfigFs = {
  exists: (p) => fs.existsSync(p),
  read: (p) => fs.readFileSync(p, 'utf8'),
  write: (p, s) => fs.writeFileSync(p, s, 'utf8'),
};

/** Files that mean "this project already tells clangd how to build", so Nexel must stay out of the way. */
export function userConfigIn(root: string, f: ConfigFs = nodeFs): string | null {
  for (const rel of ['compile_commands.json', path.join('build', 'compile_commands.json'), 'compile_flags.txt']) {
    const p = path.join(root, rel); if (f.exists(p)) return p;
  }
  const dot = path.join(root, '.clangd');
  if (f.exists(dot)) { try { if (!f.read(dot).startsWith(GENERATED_MARKER)) return dot; } catch { return dot; } }
  return null;
}

const q = (s: string) => JSON.stringify(s); // JSON strings are valid YAML double-quoted scalars (Windows backslashes included)

/** .clangd for single-file competitive programming: C++ for .cpp/.h, C for .c, bits/stdc++.h shim, chosen standard. */
export function clangdConfigYaml(opts: ClangdOptions & { includeDir?: string | null; compiler?: string | null }): string {
  const inc = opts.includeDir ? [`-I${opts.includeDir}`] : [];
  const extra = opts.extraFlags;
  const compiler = opts.compiler ? `  Compiler: ${q(opts.compiler)}\n` : '';
  const cStd = opts.std === 'c++23' || opts.std === 'c++20' ? 'c17' : 'c11';
  return [
    GENERATED_MARKER,
    '# Written by Nexel IDE for single-file C/C++ (competitive programming). Edit it freely: remove the first line',
    '# and Nexel will never touch it again. Projects with compile_commands.json or compile_flags.txt are left alone.',
    'If:',
    '  PathMatch: .*\\.c',
    'CompileFlags:',
    `  Add: [${['-xc', `-std=${cStd}`, '-Wall', ...extra].map(q).join(', ')}]`,
    compiler.replace(/\n$/, ''),
    '---',
    'If:',
    '  PathExclude: .*\\.c',
    'CompileFlags:',
    `  Add: [${['-xc++', `-std=${opts.std}`, '-Wall', ...inc, ...extra].map(q).join(', ')}]`,
    compiler.replace(/\n$/, ''),
    'Diagnostics:',
    '  UnusedIncludes: None',
    '',
  ].filter((l, i, a) => l !== '' || i === a.length - 1).join('\n');
}

export type ConfigResult = { action: 'kept-user'; path: string } | { action: 'written' | 'unchanged'; path: string } | { action: 'failed'; path: string; error: string };

/** Writes (or refreshes its own) .clangd unless the project has its own build configuration. Never overwrites user files. */
export function ensureWorkspaceConfig(root: string, opts: ClangdOptions & { includeDir?: string | null; compiler?: string | null }, f: ConfigFs = nodeFs): ConfigResult {
  const user = userConfigIn(root, f);
  if (user) return { action: 'kept-user', path: user };
  const target = path.join(root, '.clangd');
  const next = clangdConfigYaml(opts);
  try {
    if (f.exists(target) && f.read(target) === next) return { action: 'unchanged', path: target };
    f.write(target, next);
    return { action: 'written', path: target };
  } catch (e) { return { action: 'failed', path: target, error: e instanceof Error ? e.message : String(e) }; }
}
