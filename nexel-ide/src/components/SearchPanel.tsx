import { useEffect, useMemo, useRef, useState } from 'react';
import { searchFiles, type FileResult, type SearchOptions } from '../lib/searchInFiles';
import './SearchPanel.css';

export interface SearchFile { path: string; name: string; }

/** Debounced (180 ms), abortable find-in-files overlay (Ctrl+Shift+F). */
export function SearchPanel({ files, onOpen, onClose }: { files: SearchFile[]; onOpen: (path: string, line: number, col: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<SearchOptions>({});
  const [res, setRes] = useState<{ results: FileResult[]; total: number; truncated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
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
          <span className="sf-count">{res ? `${res.total}${res.truncated ? '+' : ''} match${res.total === 1 ? '' : 'es'} · ${res.results.length} files` : ''}</span></div>
      </div>
    </div>
  );
}
