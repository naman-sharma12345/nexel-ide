import { describe, it, expect } from 'vitest';
import { buildUlimitFallback } from '../LocalSandboxExecutor';

describe('buildUlimitFallback', () => {
  it('passes hostile paths as positional args, never in the script', () => {
    const evil = '/tmp/a"; rm -rf ~; echo "$(id)';
    const argv = buildUlimitFallback({ extension: '.cpp', executablePath: evil }, 262144, 2);
    expect(argv[1]).not.toContain('rm -rf');
    expect(argv[1]).toContain('exec "$1"');
    expect(argv).toContain(evil);
  });
  it('applies cpu, process, file and core limits', () => {
    const [, script] = buildUlimitFallback({ extension: '.py', executablePath: '/x.py' }, 1024, 3);
    expect(script).toMatch(/ulimit -t 3/);
    expect(script).toMatch(/ulimit -u 256/);
    expect(script).toMatch(/ulimit -c 0/);
    expect(script).toMatch(/ulimit -v 1024/);
  });
  it('skips -v for java and sanitises NaN limits', () => {
    const argv = buildUlimitFallback({ extension: '.java', executablePath: '/d', javaClassName: 'Main' }, NaN, NaN);
    expect(argv[1]).not.toMatch(/ulimit -v/);
    expect(argv[1]).toMatch(/ulimit -t 1/);
    expect(argv.slice(-2)).toEqual(['/d', 'Main']);
  });
});
