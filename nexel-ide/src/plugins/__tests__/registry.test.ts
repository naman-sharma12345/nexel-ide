import { describe, it, expect } from 'vitest';
import { listPlugins, getPlugin, pluginEnabled } from '../registry';
import '../competitive-programming';
import { useSettingsStore } from '../../stores/useSettingsStore';

describe('plugin registry', () => {
  it('registers the competitive programming plugin with its sections and commands', () => {
    const cp = getPlugin('competitive-programming');
    expect(cp).toBeDefined();
    expect(cp!.sections).toEqual(['judge', 'contests']);
    expect(cp!.commandIds).toEqual(['judge', 'contests']);
    expect(cp!.navItems.map(n => n.id)).toEqual(['judge', 'contests']);
    expect(listPlugins().length).toBeGreaterThan(0);
  });

  it('is opt-in: disabled by default, enabled only by explicit preference', () => {
    const cp = getPlugin('competitive-programming')!;
    expect(cp.defaultEnabled).toBe(false);
    expect(pluginEnabled(cp, {})).toBe(false);
    expect(pluginEnabled(cp, { 'competitive-programming': true })).toBe(true);
    expect(pluginEnabled(cp, { 'competitive-programming': false })).toBe(false);
  });
});

describe('settings plugin toggles', () => {
  it('toggles a plugin on and off and keeps other prefs', () => {
    const s = useSettingsStore.getState();
    expect(s.plugins['competitive-programming'] ?? false).toBe(false);
    s.togglePlugin('competitive-programming');
    expect(useSettingsStore.getState().plugins['competitive-programming']).toBe(true);
    s.togglePlugin('competitive-programming');
    expect(useSettingsStore.getState().plugins['competitive-programming']).toBe(false);
  });
});
