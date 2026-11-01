import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPlugin } from '../registry';
import '../competitive-programming';

describe('boundary isolation', () => {
  it('the shell imports no competitive-programming modules or stores', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(src).not.toMatch(/JudgeSystem|ContestsSystem|StressPanel/);
    expect(src).not.toMatch(/useJudgeStore/);
    // Only the side-effect plugin-registration import is allowed:
    expect(src.match(/plugins\/competitive-programming/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/^import '\.\/plugins\/competitive-programming';$/m);
  });

  it('plugin exposes its panels and activation hook through the registry', () => {
    const cp = getPlugin('competitive-programming')!;
    expect(Object.keys(cp.panels ?? {}).sort()).toEqual(['contests', 'judge']);
    expect(typeof cp.useActivation).toBe('function');
  });

  it('companion listener attaches only while enabled, across disable/enable cycles', () => {
    const onCompanionProblem = vi.fn();
    window.nexelAPI = { onCompanionProblem } as unknown as typeof window.nexelAPI;
    const useActivation = getPlugin('competitive-programming')!.useActivation!;
    const { rerender, unmount } = renderHook(({ on }) => useActivation(on), { initialProps: { on: false } });
    expect(onCompanionProblem).not.toHaveBeenCalled();
    rerender({ on: true });
    expect(onCompanionProblem).toHaveBeenCalledTimes(1);
    rerender({ on: false });
    rerender({ on: true });
    expect(onCompanionProblem).toHaveBeenCalledTimes(2);
    unmount();
  });
});
