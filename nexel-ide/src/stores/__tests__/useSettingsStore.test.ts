import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, clamp } from '../useSettingsStore';
import { THEMES, hexToRgbTriplet, getTheme, applyTheme, monacoThemeName } from '../../lib/themes';

describe('settings store', () => {
  beforeEach(() => useSettingsStore.getState().reset());
  it('clamps font size and tab size', () => {
    useSettingsStore.getState().setFontSize(999);
    expect(useSettingsStore.getState().fontSize).toBe(24);
    useSettingsStore.getState().setFontSize(NaN);
    expect(useSettingsStore.getState().fontSize).toBe(10);
    useSettingsStore.getState().setTabSize(0);
    expect(useSettingsStore.getState().tabSize).toBe(1);
    expect(clamp(5.6, 1, 8)).toBe(6);
  });
  it('rejects unknown themes', () => {
    useSettingsStore.getState().setTheme('evil<script>');
    expect(useSettingsStore.getState().theme).toBe('nexel');
    useSettingsStore.getState().setTheme('midnight');
    expect(useSettingsStore.getState().theme).toBe('midnight');
  });
  it('toggles booleans', () => {
    useSettingsStore.getState().toggle('minimap');
    expect(useSettingsStore.getState().minimap).toBe(true);
  });
});

describe('themes', () => {
  it('converts hex to rgb triplets', () => {
    expect(hexToRgbTriplet('#34d399')).toBe('52 211 153');
    expect(hexToRgbTriplet('#fff')).toBe('255 255 255');
  });
  it('falls back to default and applies tokens', () => {
    expect(getTheme('nope').id).toBe('nexel');
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
    const el = document.createElement('div');
    applyTheme('ember', el, false);
    expect(el.style.getPropertyValue('--nx-accent')).toBe('#fb923c');
    expect(el.dataset.theme).toBe('ember');
    expect(monacoThemeName('ember')).toBe('nexel-ember');
  });
});
