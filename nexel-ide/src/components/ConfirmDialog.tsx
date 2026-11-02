import { useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  detail?: string;
  /** When set, a Save button is shown and focused by default. */
  saveLabel?: string;
  discardLabel: string;
  /** Save-failure notice; the dialog stays open so no edit is lost. */
  error?: string;
  onSave?: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** In-app modal replacing native window.confirm for destructive close/save flows. */
export function ConfirmDialog({ title, message, detail, saveLabel, discardLabel, error, onSave, onDiscard, onCancel }: ConfirmDialogProps) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { (saveLabel ? saveRef.current : cancelRef.current)?.focus(); }, [saveLabel]);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); return; }
      if (e.key === 'Tab') {
        // Focus containment: Tab/Shift+Tab cycles within the dialog buttons.
        const box = boxRef.current;
        if (!box) return;
        const focusables = [...box.querySelectorAll<HTMLButtonElement>('button')];
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !box.contains(active))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', kd, true);
    return () => window.removeEventListener('keydown', kd, true);
  }, [onCancel]);
  return (
    <div className="nx-cf-backdrop" onMouseDown={onCancel}>
      <div ref={boxRef} className="nx-cf-box" role="alertdialog" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <div className="nx-cf-title">{title}</div>
        <div className="nx-cf-msg">{message}</div>
        {detail && <div className="nx-cf-detail">{detail}</div>}
        {error && <div className="nx-cf-error" role="alert">{error}</div>}
        <div className="nx-cf-actions">
          {saveLabel && <button ref={saveRef} type="button" className="nx-cf-btn nx-cf-save" onClick={onSave}>{saveLabel}</button>}
          <button type="button" className="nx-cf-btn nx-cf-discard" onClick={onDiscard}>{discardLabel}</button>
          <button ref={cancelRef} type="button" className="nx-cf-btn nx-cf-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
