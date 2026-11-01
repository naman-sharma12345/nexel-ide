import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ensureWorkspaceConfig, clangdConfigYaml, userConfigIn, GENERATED_MARKER, type ConfigFs } from '../workspaceConfig';
import { validateClangdOptions, partitionFlags } from '../lspValidate';
import { clangdArgs, clangdDirCandidates, findCompiler } from '../resolveClangd';

const memFs = (files: Record<string, string> = {}): ConfigFs & { files: Record<string, string> } => ({
  files,
  exists: (p) => p in files,
  read: (p) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
  write: (p, s) => { files[p] = s; },
});
const root = path.resolve('/ws');
const opts = { std: 'c++17' as const, extraFlags: [], includeDir: '/app/nexel-include', compiler: '/usr/bin/g++' };

describe('workspace .clangd', () => {
  it('writes a marked .clangd with std, shim and compiler for folders without build config', () => {
    const f = memFs(); const r = ensureWorkspaceConfig(root, opts, f);
    expect(r.action).toBe('written');
    const y = f.files[path.join(root, '.clangd')];
    expect(y.startsWith(GENERATED_MARKER)).toBe(true);
    expect(y).toContain('"-std=c++17"'); expect(y).toContain('"-I/app/nexel-include"'); expect(y).toContain('Compiler: "/usr/bin/g++"');
    expect(y).toContain('"-xc"'); expect(y).toContain('PathExclude');
  });
  it('is idempotent and refreshes only its own file', () => {
    const f = memFs(); ensureWorkspaceConfig(root, opts, f);
    expect(ensureWorkspaceConfig(root, opts, f).action).toBe('unchanged');
    expect(ensureWorkspaceConfig(root, { ...opts, std: 'c++20' }, f).action).toBe('written');
    expect(f.files[path.join(root, '.clangd')]).toContain('"-std=c++20"');
  });
  it('never overwrites user configuration', () => {
    for (const rel of ['compile_commands.json', 'build/compile_commands.json', 'compile_flags.txt', '.clangd']) {
      const p = path.join(root, rel); const f = memFs({ [p]: 'CompileFlags: {}\n' });
      const r = ensureWorkspaceConfig(root, opts, f);
      expect(r.action).toBe('kept-user'); expect(f.files[p]).toBe('CompileFlags: {}\n');
    }
    expect(userConfigIn(root, memFs())).toBeNull();
  });
  it('escapes Windows paths as YAML/JSON strings', () => {
    const y = clangdConfigYaml({ ...opts, includeDir: 'C:\\Program Files\\Nexel\\resources\\nexel-include', compiler: 'C:\\mingw64\\bin\\g++.exe' });
    expect(y).toContain('"-IC:\\\\Program Files\\\\Nexel\\\\resources\\\\nexel-include"');
    expect(y).toContain('Compiler: "C:\\\\mingw64\\\\bin\\\\g++.exe"');
  });
  it('reports write failures instead of throwing', () => {
    const f = memFs(); f.write = () => { throw new Error('EACCES'); };
    expect(ensureWorkspaceConfig(root, opts, f)).toMatchObject({ action: 'failed', error: 'EACCES' });
  });
});

describe('clangd option validation (renderer input is untrusted)', () => {
  it('defaults and allowlists the standard', () => {
    expect(validateClangdOptions(undefined)).toEqual({ std: 'c++17', extraFlags: [] });
    expect(validateClangdOptions({ std: 'c++23' }).std).toBe('c++23');
    expect(validateClangdOptions({ std: 'gnu++99; rm -rf' }).std).toBe('c++17');
  });
  it('keeps harmless flags and drops code-loading or shell-ish ones', () => {
    const { extraFlags } = validateClangdOptions({ extraFlags: ['-DLOCAL', '-Wshadow', '-O2', '-fplugin=/x.so', '-Xclang', '-load', '@rsp', '-DX=$(id)', '-Iinclude', '-march=native', '-B/evil'] });
    expect(extraFlags).toEqual(['-DLOCAL', '-Wshadow', '-O2', '-Iinclude', '-march=native']);
    expect(validateClangdOptions({ extraFlags: '-DLOCAL  -Wextra' }).extraFlags).toEqual(['-DLOCAL', '-Wextra']);
    expect(validateClangdOptions({ extraFlags: Array(50).fill('-Wall') }).extraFlags).toHaveLength(32);
    expect(partitionFlags('-DLOCAL -fplugin=a.so')).toEqual({ ok: ['-DLOCAL'], rejected: ['-fplugin=a.so'] });
  });
});

describe('clangd argv and discovery', () => {
  it('argv is fixed; query-driver only takes an absolute, glob-free path', () => {
    expect(clangdArgs()).not.toContain(expect.stringMatching(/query-driver/));
    expect(clangdArgs({ queryDriver: '/usr/bin/g++' })).toContain('--query-driver=/usr/bin/g++');
    expect(clangdArgs({ queryDriver: '/usr/bin/*' }).some(a => a.startsWith('--query-driver'))).toBe(false);
    expect(clangdArgs({ queryDriver: 'g++' }).some(a => a.startsWith('--query-driver'))).toBe(false);
  });
  it('maps hosts to bundled folders (mac universal, win arm64 -> x64)', () => {
    expect(clangdDirCandidates('darwin', 'arm64')).toEqual(['mac-arm64', 'mac-universal']);
    expect(clangdDirCandidates('win32', 'arm64')).toEqual(['win-arm64', 'win-x64']);
    expect(clangdDirCandidates('linux', 'x64')).toEqual(['linux-x64']);
  });
  it('finds g++ before clang++ and skips relative PATH entries', () => {
    const exists = (p: string) => p === '/opt/llvm/clang++' || p === 'rel/g++';
    expect(findCompiler({ platform: 'linux', pathEnv: 'rel:/opt/llvm', exists })).toBe('/opt/llvm/clang++');
    expect(findCompiler({ platform: 'win32', pathEnv: 'C:\\mingw64\\bin', exists: p => p === 'C:\\mingw64\\bin\\g++.exe' })).toBe('C:\\mingw64\\bin\\g++.exe');
  });
});
