import { describe, it, expect } from 'vitest';
import { languageLabel, judgeSummary } from '../StatusBar';
import { useStatusStore } from '../../stores/useStatusStore';

describe('StatusBar helpers', () => {
  it('maps extensions to labels', () => {
    expect(languageLabel('a.cpp')).toBe('C++');
    expect(languageLabel('x.py')).toBe('Python');
    expect(languageLabel('README')).toBe('Plain Text');
    expect(languageLabel()).toBe('—');
  });
  it('summarises judge state', () => {
    expect(judgeSummary([], true).tone).toBe('run');
    expect(judgeSummary([{ verdict: 'IDLE' }], false).text).toBe('Judge ready');
    expect(judgeSummary([{ verdict: 'AC' }, { verdict: 'WA' }], false)).toEqual({ tone: 'bad', text: '1/2 passed' });
    expect(judgeSummary([{ verdict: 'AC' }], false).tone).toBe('ok');
  });
});

describe('useStatusStore', () => {
  it('bounds the toast queue and dedupes messages', () => {
    const s = useStatusStore.getState();
    for (let i = 0; i < 8; i++) s.pushToast('m' + i, 'info', 0);
    s.pushToast('m7', 'info', 0);
    const t = useStatusStore.getState().toasts;
    expect(t.length).toBeLessThanOrEqual(4);
    expect(t.filter(x => x.message === 'm7').length).toBe(1);
  });
});
