import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

// Heavy third-party editor/terminal deps are stubbed; the shell itself renders for real.
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'monaco-stub' }),
  loader: { init: async () => ({}), config: () => {} },
  useMonaco: () => null,
}));
vi.mock('xterm', () => ({
  Terminal: class { loadAddon() {} open() {} write() {} dispose() {} onData() {} },
}));
vi.mock('xterm-addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('xterm/css/xterm.css', () => ({}));

import App from '../App';
import { useSettingsStore } from '../stores/useSettingsStore';

describe('full shell smoke', () => {
  beforeEach(() => {
    cleanup();
    const s = useSettingsStore.getState();
    if (s.plugins['competitive-programming']) s.togglePlugin('competitive-programming');
  });

  it('renders the default general-purpose shell (CP off)', () => {
    render(<App />);
    expect(document.querySelector('.nx-titlebar-container')).toBeTruthy();
    expect(screen.queryByText(/Judge/i)).toBeNull();
  });

  it('renders with CP enabled and survives disable/re-enable cycles', async () => {
    const { unmount } = render(<App />);
    await act(async () => { useSettingsStore.getState().togglePlugin('competitive-programming', true); });
    await act(async () => { useSettingsStore.getState().togglePlugin('competitive-programming', false); });
    await act(async () => { useSettingsStore.getState().togglePlugin('competitive-programming', true); });
    expect(document.querySelector('.nx-titlebar-container')).toBeTruthy();
    unmount();
  });
});
