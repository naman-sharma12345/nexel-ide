import { describe, it, expect } from 'vitest';
import { collectOfflineItems } from './offlineCompletions';
import dataset from '../../dataset.json';
import cpDataset from '../plugins/competitive-programming/cp-dataset.json';
import snippets from '../plugins/competitive-programming/snippets.json';

const coreDataset = dataset;
const cpContrib = { dataset: { ...dataset, cp: cpDataset }, snippets };
const base = { dataset: coreDataset, snippets: {}, hasUsingStd: false, enableSnippets: true };
const cpOn = { dataset: cpContrib.dataset, snippets: cpContrib.snippets, pluginCategories: ['cp'] };

describe('collectOfflineItems CP gating', () => {
  it('omits CP aliases and snippets when the CP plugin is off', () => {
    const items = collectOfflineItems({ ...base, clangdOn: false });
    expect(items.some(i => i.category === 'cp')).toBe(false);
    expect(items.some(i => i.isSnippet)).toBe(false);
    expect(items.some(i => i.category === 'keywords')).toBe(true); // general completions unaffected
  });

  it('includes CP aliases and snippets when enabled, and again after a disable/re-enable cycle', () => {
    const on = collectOfflineItems({ ...base, ...cpOn, clangdOn: false });
    expect(on.some(i => i.category === 'cp')).toBe(true);
    expect(on.some(i => i.isSnippet)).toBe(true);
    // cycle
    collectOfflineItems({ ...base, clangdOn: false });
    const reenabled = collectOfflineItems({ ...base, ...cpOn, clangdOn: false });
    expect(reenabled).toEqual(on);
  });

  it('with clangd active, CP plugin off yields no offline items at all', () => {
    const items = collectOfflineItems({ ...base, clangdOn: true });
    expect(items).toEqual([]);
  });

  it('with clangd active, plugin categories still serve (CP aliases only)', () => {
    const items = collectOfflineItems({ ...base, ...cpOn, clangdOn: true });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.category === 'cp' || i.isSnippet)).toBe(true);
  });

  it('strips std:: prefixes when the file has using namespace std', () => {
    const items = collectOfflineItems({ ...base, ...cpOn, clangdOn: false, hasUsingStd: true });
    expect(items.some(i => i.label.startsWith('std::'))).toBe(false);
  });
});
