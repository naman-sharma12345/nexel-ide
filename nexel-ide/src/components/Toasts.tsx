import { useStatusStore } from '../stores/useStatusStore';
import './Toasts.css';

const ICON = { success: 'M5 13l4 4L19 7', error: 'M6 6l12 12M18 6L6 18', info: 'M12 8v.01M12 11v5' } as const;

export function Toasts() {
  const toasts = useStatusStore(s => s.toasts);
  const dismiss = useStatusStore(s => s.dismissToast);
  return (
    <div className="tz-stack" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`tz-toast tz-${t.kind}`} role="status" onClick={() => dismiss(t.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[t.kind]} /></svg>
          <span>{t.message}</span>
          <i className="tz-bar" />
        </div>
      ))}
    </div>
  );
}
