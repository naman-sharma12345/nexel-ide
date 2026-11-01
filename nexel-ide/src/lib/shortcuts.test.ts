import { describe, it, expect } from 'vitest';
import { SHORTCUT_GROUPS, shortcutGroupsFor } from './shortcuts';

describe('shortcutGroupsFor', () => {
  it('hides CP-only rows when the CP plugin is off', () => {
    const groups = shortcutGroupsFor(false);
    const labels = groups.flatMap(g => g.items.map(i => i.label));
    expect(labels.some(l => /companion|import problem/i.test(l))).toBe(false);
  });
  it('keeps CP rows when the CP plugin is on', () => {
    const labels = shortcutGroupsFor(true).flatMap(g => g.items.map(i => i.label));
    expect(labels.some(l => /import problem/i.test(l))).toBe(true);
  });
  it('drops groups left empty by filtering', () => {
    for (const g of shortcutGroupsFor(false)) expect(g.items.length).toBeGreaterThan(0);
  });
  it('disambiguates the Ctrl+/ contexts and marks theme as a palette command', () => {
    const labels = SHORTCUT_GROUPS.flatMap(g => g.items.map(i => i.label));
    expect(labels).toContain('This sheet (outside editor)');
    expect(labels).toContain('Toggle comment (in editor)');
    expect(labels.some(l => /via palette/.test(l))).toBe(true);
    expect(labels).not.toContain('Switch theme');
  });
});
