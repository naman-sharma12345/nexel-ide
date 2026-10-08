import { memo } from 'react';
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
        <span className="sb-item">{languageLabel(tab?.name)}</span>
        <span className="sb-item">UTF-8</span>
        <button className="sb-item sb-btn sb-theme" onClick={() => openSettings(true)} title="Settings (Ctrl+,)"><i className="sb-swatch" />{themeName}</button>
        <button className={`sb-item sb-btn ${terminalVisible ? 'on' : ''}`} onClick={toggleTerminal} title="Toggle terminal">Terminal</button>
        <span className="sb-item sb-hint"><kbd>Ctrl</kbd><kbd>⇧</kbd><kbd>P</kbd></span>
      </div>
    </footer>
  );
});
