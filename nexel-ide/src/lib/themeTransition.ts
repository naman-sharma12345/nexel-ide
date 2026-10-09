import { applyTheme } from './themes';
import { useSettingsStore } from '../stores/useSettingsStore';

let lastX = window.innerWidth / 2, lastY = 80;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastX = e.clientX; lastY = e.clientY; }, { capture: true, passive: true });
}

/**
 * Switches theme with a circular reveal that grows from the last click (View Transitions API,
 * Chromium/Electron). Falls back to the plain colour-glide when unsupported or reduced-motion.
 */
export function switchTheme(id: string): void {
  const st = useSettingsStore.getState();
  if (st.theme === id) return;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) { st.setTheme(id); return; }
  const r = Math.hypot(Math.max(lastX, window.innerWidth - lastX), Math.max(lastY, window.innerHeight - lastY));
  const t = doc.startViewTransition(() => { st.setTheme(id); applyTheme(id, document.documentElement, false); });
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${lastX}px ${lastY}px)`, `circle(${r}px at ${lastX}px ${lastY}px)`] },
      { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => { /* transition skipped */ });
}
