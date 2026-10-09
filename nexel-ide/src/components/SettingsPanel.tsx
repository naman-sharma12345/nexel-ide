import { useEffect } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { THEMES } from '../lib/themes';
import './SettingsPanel.css';
import { switchTheme } from '../lib/themeTransition';

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button className="sp-row sp-toggle" role="switch" aria-checked={on} onClick={onClick}>
      <span><b>{label}</b><small>{hint}</small></span>
      <i className={`sp-switch ${on ? 'on' : ''}`}><em /></i>
    </button>
  );
}

export function SettingsPanel() {
  const open = useSettingsStore(s => s.settingsOpen);
  const s = useSettingsStore();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') useSettingsStore.getState().openSettings(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) s.openSettings(false); }}>
      <div className="sp-box" role="dialog" aria-label="Settings">
        <header className="sp-head">
          <h2>Settings</h2>
          <button className="sp-x" onClick={() => s.openSettings(false)} aria-label="Close settings">✕</button>
        </header>
        <div className="sp-body">
          <section>
            <h3>Theme</h3>
            <div className="sp-themes">
              {THEMES.map((t, i) => (
                <button key={t.id} className={`sp-theme ${s.theme === t.id ? 'active' : ''}`} style={{ animationDelay: `${i * 45}ms` }} onClick={() => switchTheme(t.id)} aria-pressed={s.theme === t.id}>
                  <span className="sp-preview" style={{ background: t.editorBg, borderColor: `${t.accent}44` }}>
                    <i style={{ background: t.bg1 }} />
                    <u style={{ background: t.accent }} /><u style={{ background: t.accent2, width: '38%' }} /><u style={{ background: t.syntax.keyword, width: '52%' }} />
                  </span>
                  <b>{t.name}</b><small>{t.blurb}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Editor</h3>
            <div className="sp-row">
              <span><b>Font size</b><small>10 – 24 px</small></span>
              <div className="sp-stepper">
                <button onClick={() => s.setFontSize(s.fontSize - 1)} aria-label="Decrease font size">−</button>
                <output>{s.fontSize}</output>
                <button onClick={() => s.setFontSize(s.fontSize + 1)} aria-label="Increase font size">+</button>
              </div>
            </div>
            <div className="sp-row">
              <span><b>Tab size</b><small>Spaces per indent</small></span>
              <div className="sp-seg">
                {[2, 4, 8].map(n => <button key={n} className={s.tabSize === n ? 'on' : ''} onClick={() => s.setTabSize(n)}>{n}</button>)}
              </div>
            </div>
            <Toggle on={s.ligatures} onClick={() => s.toggle('ligatures')} label="Font ligatures" hint="Render -> != >= as single glyphs" />
            <Toggle on={s.wordWrap} onClick={() => s.toggle('wordWrap')} label="Word wrap" hint="Wrap long lines at the viewport edge" />
            <Toggle on={s.minimap} onClick={() => s.toggle('minimap')} label="Minimap" hint="Code overview on the right edge" />
          </section>
        </div>
        <footer className="sp-foot">
          <button className="sp-reset" onClick={() => s.reset()}>Reset to defaults</button>
          <span><kbd>Ctrl</kbd><kbd>,</kbd> to toggle · <kbd>Esc</kbd> to close</span>
        </footer>
      </div>
    </div>
  );
}
