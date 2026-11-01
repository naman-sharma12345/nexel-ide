import { describe, it, expect } from 'vitest';
import { collectOfflineItems } from './offlineCompletions';
import dataset from '../../dataset.json';
import snippets from '../../snippets.json';

const base = { dataset, snippets, hasUsingStd: false, enableSnippets: true };

describe('collectOfflineItems CP gating', () => {
  it('omits CP aliases and snippets when the CP plugin is off', () => {
    const items = collectOfflineItems({ ...base, clangdOn: false, cpOn: false });
    expect(items.some(i => i.category === 'cp')).toBe(false);
    expect(items.some(i => i.isSnippet)).toBe(false);
    expect(items.some(i => i.category === 'keywords')).toBe(true); // general completions unaffected
  });

  it('includes CP aliases and snippets when enabled, and again after a disable/re-enable cycle', () => {
    const on = collectOfflineItems({ ...base, clangdOn: false, cpOn: true });
    expect(on.some(i => i.category === 'cp')).toBe(true);
    expect(on.some(i => i.isSnippet)).toBe(true);
    // cycle
    collectOfflineItems({ ...base, clangdOn: false, cpOn: false });
    const reenabled = collectOfflineItems({ ...base, clangdOn: false, cpOn: true });
    expect(reenabled).toEqual(on);
  });

  it('with clangd active, CP plugin off yields no offline items at all', () => {
    const items = collectOfflineItems({ ...base, clangdOn: true, cpOn: false });
    expect(items).toEqual([]);
  });

  it('strips std:: prefixes when the file has using namespace std', () => {
    const items = collectOfflineItems({ ...base, clangdOn: false, cpOn: true, hasUsingStd: true });
    expect(items.some(i => i.label.startsWith('std::'))).toBe(false);
  });
});
