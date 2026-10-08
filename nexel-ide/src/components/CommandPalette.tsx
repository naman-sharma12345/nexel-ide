import { useEffect, useMemo, useRef, useState } from 'react';
import './CommandPalette.css';

export interface PaletteCommand { id: string; label: string; hint?: string; run: () => void; }

/** Subsequence fuzzy score: lower is better, -1 = no match. Rewards consecutive and early hits. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let ti = 0, score = 0, last = -1;
  for (const ch of q) {
    const i = t.indexOf(ch, ti);
    if (i < 0) return -1;
    score += i - (last + 1) + (i === 0 ? 0 : 1);
    last = i; ti = i + 1;
  }
  return score;
}

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const results = useMemo(() => {
    if (!q) return commands;
    return commands.map(c => ({ c, s: fuzzyScore(q, c.label) })).filter(x => x.s >= 0).sort((a, b) => a.s - b.s).map(x => x.c);
  }, [q, commands]);
  const exec = (c?: PaletteCommand) => { if (c) { onClose(); c.run(); } };
  return (
    <div className="cp-backdrop" onMouseDown={onClose}>
      <div className="cp-box" role="dialog" aria-label="Command palette" onMouseDown={e => e.stopPropagation()}>
        <input ref={inputRef} className="cp-input" placeholder="Type a command…" value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') exec(results[sel]);
          }} />
        <div className="cp-list">
          {results.length === 0 && <div className="cp-empty">No matching commands</div>}
          {results.map((c, i) => (
            <div key={c.id} className={'cp-item' + (i === sel ? ' active' : '')}
              style={{ animationDelay: `${Math.min(i, 8) * 18}ms` }}
              onMouseEnter={() => setSel(i)} onClick={() => exec(c)}>
              <span>{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
