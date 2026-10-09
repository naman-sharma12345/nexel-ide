import { useEffect, useMemo, useRef, useState } from 'react';
import { searchFiles, type FileResult, type SearchOptions } from '../lib/searchInFiles';
import { replaceInText } from '../lib/replaceInText';
import './SearchPanel.css';

export interface SearchFile { path: string; name: string; }

/** Debounced (180 ms), abortable find-in-files overlay (Ctrl+Shift+F). */
export function SearchPanel({ files, onOpen, onClose }: { files: SearchFile[]; onOpen: (path: string, line: number, col: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<SearchOptions>({});
  const [res, setRes] = useState<{ results: FileResult[]; total: number; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const [rep, setRep] = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setRes(null); setBusy(false); return; }
    const ac = new AbortController();
    setBusy(true);
    const t = window.setTimeout(async () => {
      const r = await searchFiles(files, p => window.nexelAPI.readFileContent(p), q, opts, ac.signal);
      if (!ac.signal.aborted) { setRes(r); setBusy(false); setSel(0); }
    }, 180);
    return () => { ac.abort(); window.clearTimeout(t); };
  }, [q, opts, files]);

  const flat = useMemo(() => (res?.results ?? []).flatMap(f => f.matches.map(m => ({ f, m }))), [res]);
  const go = (i: number) => { const x = flat[i]; if (x) { onClose(); onOpen(x.f.path, x.m.line, x.m.col); } };
  const replaceAll = async () => {
    if (!res || !res.total) return;
    if (!window.confirm(`Replace ${res.total} match(es) in ${res.results.length} file(s)?`)) return;
    let n = 0, fc = 0;
    for (const f of res.results) {
      try {
        const src = await window.nexelAPI.readFileContent(f.path);
        const r = replaceInText(src, q, rep, opts);
        if (r.count > 0 && await window.nexelAPI.writeFileContent(f.path, r.text)) { n += r.count; fc++; }
      } catch { /* skip unreadable file */ }
    }
    setNote(`Replaced ${n} in ${fc} file${fc === 1 ? '' : 's'}`);
    setRes(null); setQ(q + ' ');
    window.setTimeout(() => setQ(x => x.trimEnd()), 0);
  };
  const flag = (k: keyof SearchOptions, label: string, title: string) => (
    <button type="button" className={'sp2-flag' + (opts[k] ? ' on' : '')} title={title} aria-pressed={!!opts[k]} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))}>{label}</button>
  );
  let idx = -1;
  return (
    <div className="sf-backdrop" onMouseDown={onClose}>
      <div className="sf-box" role="dialog" aria-label="Find in files" onMouseDown={e => e.stopPropagation()}>
        <div className="sf-bar">
          <span className={'sf-glyph' + (busy ? ' busy' : '')} aria-hidden>⌕</span>
          <input ref={inputRef} className="sf-input" placeholder="Find in files…" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') go(sel);
            }} />
          {flag('caseSensitive', 'Aa', 'Match case')}{flag('wholeWord', 'ab', 'Whole word')}{flag('regex', '.*', 'Regular expression')}
        </div>
        <div className="sf-bar sf-rep">
          <span className="sf-glyph" aria-hidden>↳</span>
          <input className="sf-input" placeholder="Replace with…" value={rep} onChange={e => setRep(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onClose(); else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void replaceAll(); }} />
          <button type="button" className="sp2-flag sf-repbtn" disabled={!res || !res.total} title="Replace all (Ctrl+Enter)" onClick={() => void replaceAll()}>Replace all</button>
        </div>
        <div className="sf-list">
          {!q.trim() && <div className="sf-empty">Search across {files.length} file{files.length === 1 ? '' : 's'} in this workspace</div>}
          {q.trim() && res && res.total === 0 && !busy && <div className="sf-empty">No results</div>}
          {res?.results.map(f => (
            <div key={f.path} className="sf-group">
              <div className="sf-file"><span>{f.name}</span><em>{f.matches.length}</em></div>
              {f.matches.map(m => { idx++; const my = idx; return (
                <div key={m.line + ':' + m.col} className={'sf-hit' + (my === sel ? ' active' : '')} style={{ animationDelay: `${Math.min(my, 10) * 16}ms` }} onMouseEnter={() => setSel(my)} onClick={() => go(my)}>
                  <span className="sf-ln">{m.line}</span>
                  <code>{m.text.slice(Math.max(0, m.col - 1 - 40), m.col - 1)}<mark>{m.text.slice(m.col - 1, m.col - 1 + m.length)}</mark>{m.text.slice(m.col - 1 + m.length, m.col - 1 + m.length + 80)}</code>
                </div>); })}
            </div>
          ))}
        </div>
        <div className="sf-foot"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>
          <span className="sf-count">{note ? note : res ? `${res.total}${res.truncated ? '+' : ''} match${res.total === 1 ? '' : 'es'} · ${res.results.length} files` : ''}</span></div>
      </div>
    </div>
  );
}
