import { useEffect, useState } from 'react';
import { CPP_STDS } from '../stores/useSettingsStore';
import { partitionFlags } from '../main/services/lsp/lspValidate';
import { useLspStore, STATUS_LABEL } from '../lib/clangd/state';
import { getClangd } from '../lib/clangd/session';
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

function IntelliSenseSection() {
  const s = useSettingsStore();
  const status = useLspStore(x => x.status);
  const detail = useLspStore(x => x.detail);
  const [draft, setDraft] = useState(s.clangdFlags);
  useEffect(() => setDraft(s.clangdFlags), [s.clangdFlags]);
  const { rejected } = partitionFlags(draft);
  const commit = () => { if (draft.trim() !== s.clangdFlags) s.setClangdFlags(draft); };
  return (
    <section id="sp-intellisense">
      <h3>IntelliSense <span className="sp-h-note">C / C++</span></h3>
      <div className="sp-row sp-lsp-status">
        <span><b>clangd</b><small title={detail}>{detail || 'Language server for C and C++'}</small></span>
        <span className="sp-lsp-right">
          <i className={`sp-lsp-pill sb-lsp-${status}`}><i className="sb-lsp-dot" />{STATUS_LABEL[status]}</i>
          <button className="sp-mini" onClick={() => void getClangd().restart()} disabled={!s.clangdEnabled}>Restart</button>
        </span>
      </div>
      <Toggle on={s.clangdEnabled} onClick={() => s.toggle('clangdEnabled')} label="Enable clangd" hint="Semantic completions, hovers, diagnostics, go to definition, rename, format. Off = built-in completions only" />
      <div className="sp-row">
        <span><b>C++ standard</b><small>Written to the workspace .clangd (never over your own config)</small></span>
        <div className="sp-seg">
          {CPP_STDS.map(v => <button key={v} className={s.cppStd === v ? 'on' : ''} onClick={() => s.setCppStd(v)} disabled={!s.clangdEnabled}>{v.replace('c++', 'C++')}</button>)}
        </div>
      </div>
      <label className="sp-row sp-col">
        <span><b>Extra compiler flags</b><small>For example <code>-DLOCAL -Wshadow -Wconversion</code>. Applied on Enter or when you leave the field</small></span>
        <input className={`sp-input ${rejected.length ? 'bad' : ''}`} value={draft} spellCheck={false} placeholder="-DLOCAL -Wshadow" disabled={!s.clangdEnabled}
          onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }} />
        {rejected.length > 0 && <small className="sp-warn">Ignored for safety: {rejected.join(' ')} (only -D, -U, -W, -f, -O, -m, -I style flags are allowed)</small>}
      </label>
    </section>
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
          <IntelliSenseSection />
        </div>
        <footer className="sp-foot">
          <button className="sp-reset" onClick={() => s.reset()}>Reset to defaults</button>
          <span><kbd>Ctrl</kbd><kbd>,</kbd> to toggle · <kbd>Esc</kbd> to close</span>
        </footer>
      </div>
    </div>
  );
}
