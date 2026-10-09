import { memo, useEffect, useRef, useState } from 'react';
import { useLspStore, STATUS_HINT, STATUS_LABEL } from '../lib/clangd/state';
import { getClangd } from '../lib/clangd/session';
import { useStatusStore } from '../stores/useStatusStore';
import { useEditorStore } from '../stores/useEditorStore';
import { useJudgeStore } from '../stores/useJudgeStore';
import { useUIStore } from '../stores/useUIStore';
import { useSettingsStore, } from '../stores/useSettingsStore';
import { getTheme } from '../lib/themes';
import './StatusBar.css';

const LANGS: Record<string, string> = { cpp: 'C++', cc: 'C++', cxx: 'C++', h: 'C++', hpp: 'C++', c: 'C', py: 'Python', java: 'Java', js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript React', rs: 'Rust', go: 'Go', md: 'Markdown', json: 'JSON', html: 'HTML', css: 'CSS', txt: 'Plain Text' };
export function languageLabel(name?: string): string {
  if (!name) return '—';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return LANGS[ext] ?? 'Plain Text';
}

/** Summarises the judge: a pulsing dot while running, otherwise passed/total of the last run. */
export function judgeSummary(cases: { verdict?: string }[], running: boolean): { tone: 'run' | 'ok' | 'bad' | 'idle'; text: string } {
  if (running) return { tone: 'run', text: 'Judging…' };
  const ran = cases.filter(c => c.verdict && c.verdict !== 'IDLE' && c.verdict !== 'RUNNING');
  if (!ran.length) return { tone: 'idle', text: 'Judge ready' };
  const ac = ran.filter(c => c.verdict === 'AC').length;
  return { tone: ac === ran.length ? 'ok' : 'bad', text: `${ac}/${ran.length} passed` };
}

/** clangd chip: live state dot + label, tooltip, and a small menu (restart, enable/disable, settings). */
export function ClangdChip() {
  const status = useLspStore(s => s.status);
  const detail = useLspStore(s => s.detail);
  const progress = useLspStore(s => s.progress);
  const enabled = useSettingsStore(s => s.clangdEnabled);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [open]);
  const label = STATUS_LABEL[status] + (status === 'indexing' && progress != null ? ` ${Math.round(progress)}%` : '');
  const canRestart = enabled && status !== 'off' && status !== 'disabled';
  return (
    <div className="sb-lsp-wrap" ref={ref}>
      <button className={`sb-item sb-btn sb-lsp sb-lsp-${status} ${open ? 'on' : ''}`} onClick={() => setOpen(o => !o)}
        title={`clangd: ${label}\n${STATUS_HINT[status]}${detail ? `\n${detail}` : ''}`} aria-haspopup="menu" aria-expanded={open} data-status={status}>
        <i className="sb-lsp-dot" aria-hidden="true" /><span className="sb-lsp-name">clangd</span><em>{label}</em>
      </button>
      {open && (
        <div className="sb-menu" role="menu" aria-label="clangd">
          <header><i className={`sb-lsp-dot sb-lsp-${status}`} /><b>clangd IntelliSense</b><span className={`sb-lsp-tag sb-lsp-${status}`}>{label}</span></header>
          <p>{STATUS_HINT[status]}</p>
          {detail && <small>{detail}</small>}
          <div className="sb-menu-items">
            <button role="menuitem" disabled={!canRestart} onClick={() => { setOpen(false); void getClangd().restart(); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>Restart clangd
            </button>
            <button role="menuitem" onClick={() => { setOpen(false); useSettingsStore.getState().toggle('clangdEnabled'); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={enabled ? 'M6 6l12 12M18 6L6 18' : 'M5 13l4 4L19 7'} /></svg>{enabled ? 'Use built-in IntelliSense only' : 'Enable clangd'}
            </button>
            <button role="menuitem" onClick={() => { setOpen(false); useSettingsStore.getState().openSettings(true); window.setTimeout(() => document.getElementById('sp-intellisense')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" /></svg>IntelliSense settings…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const StatusBar = memo(function StatusBar() {
  const line = useStatusStore(s => s.line);
  const col = useStatusStore(s => s.col);
  const selected = useStatusStore(s => s.selected);
  const activePath = useEditorStore(s => s.activeTabPath);
  const tab = useEditorStore(s => s.tabs.find(t => t.filePath === activePath));
  const cases = useJudgeStore(s => s.testCases);
  const running = useJudgeStore(s => s.isRunning);
  const terminalVisible = useUIStore(s => s.terminalVisible);
  const toggleTerminal = useUIStore(s => s.toggleTerminal);
  const themeName = getTheme(useSettingsStore(s => s.theme)).name;
  const openSettings = useSettingsStore(s => s.openSettings);
  const judge = judgeSummary(cases, running);

  return (
    <footer className="sb-bar" role="status" aria-label="Status bar">
      <div className="sb-group">
        <span className="sb-brand"><i className="sb-dot" />Nexel</span>
        {tab && <span className="sb-item sb-file" title={tab.filePath}>{tab.name}{tab.isDirty && <i className="sb-dirty" title="Unsaved changes" />}</span>}
      </div>
      <div className="sb-group sb-right">
        <button className={`sb-item sb-judge sb-${judge.tone}`} title="Judge status"><i className="sb-pulse" />{judge.text}</button>
        {tab && <span className="sb-item sb-num">Ln {line}, Col {col}{selected > 0 && <em> ({selected} sel)</em>}</span>}
        <ClangdChip />
        <span className="sb-item">{languageLabel(tab?.name)}</span>
        <span className="sb-item">UTF-8</span>
        <button className="sb-item sb-btn sb-theme" onClick={() => openSettings(true)} title="Settings (Ctrl+,)"><i className="sb-swatch" />{themeName}</button>
        <button className={`sb-item sb-btn ${terminalVisible ? 'on' : ''}`} onClick={toggleTerminal} title="Toggle terminal">Terminal</button>
        <span className="sb-item sb-hint"><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
      </div>
    </footer>
  );
});
