import { useEffect, useRef, useState } from 'react';
import { shortcutGroupsFor, keyLabel } from '../lib/shortcuts';
import { useSettingsStore } from '../stores/useSettingsStore';
import { pluginEnabledById } from '../plugins/registry';
import './ShortcutsSheet.css';

/** Cheat-sheet overlay. Keycaps physically "press" when you hit the matching key while it is open. */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const [down, setDown] = useState<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement>(null);
  const cpOn = useSettingsStore(s => pluginEnabledById('competitive-programming', s.plugins));
  // A modal must hold the keyboard: without focus here, keys fall through to whatever had
  // focus before (e.g. the terminal shell) while the sheet is up.
  useEffect(() => { boxRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      setDown(s => new Set(s).add(keyLabel(e)));
    };
    const ku = (e: KeyboardEvent) => setDown(s => { const n = new Set(s); n.delete(keyLabel(e)); return n; });
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [onClose]);
  const groups = shortcutGroupsFor(cpOn);
  return (
    <div className="ss-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ss-box" role="dialog" aria-label="Keyboard shortcuts" tabIndex={-1} ref={boxRef}>
        <header className="ss-head"><h2>Keyboard shortcuts</h2><span>press any key to try it</span></header>
        <div className="ss-grid">
          {groups.map((g, gi) => (
            <section key={g.title} className="ss-group" style={{ animationDelay: `${120 + gi * 70}ms` }}>
              <h3>{g.title}</h3>
              {g.items.map(it => (
                <div key={it.label} className="ss-row">
                  <span>{it.label}</span>
                  <span className="ss-keys">{it.keys.map((k, i) => <kbd key={i} className={down.has(k) ? 'down' : ''}>{k}</kbd>)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
