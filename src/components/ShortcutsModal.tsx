import { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘K'], label: 'Command palette' },
  { keys: ['j', 'k'], label: 'Next / previous thread' },
  { keys: ['Enter'], label: 'Open the selected thread (mobile)' },
  { keys: ['r'], label: 'Reply to the latest message' },
  { keys: ['a'], label: 'Reply all' },
  { keys: ['f'], label: 'Forward' },
  { keys: ['c'], label: 'New message' },
  { keys: ['e'], label: 'Archive / unarchive' },
  { keys: ['s'], label: 'Star / unstar' },
  { keys: ['u'], label: 'Mark unread' },
  { keys: ['b'], label: 'Blur names and emails (demo mode)' },
  { keys: ['/'], label: 'Search' },
  { keys: ['Esc'], label: 'Close compose, palette, or this help' },
  { keys: ['?'], label: 'This cheatsheet' },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  return (
    <div className="modal-layer" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <dl className="shortcut-list">
          {SHORTCUTS.map((item) => (
            <div key={item.label} className="shortcut-row">
              <dt>
                {item.keys.map((key, index) => (
                  <span key={key}>
                    {index > 0 && <span className="shortcut-sep"> / </span>}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{item.label}</dd>
            </div>
          ))}
        </dl>
        <p className="fine-print">Shortcuts pause while you type in a field. ⌘ is Ctrl on Windows and Linux.</p>
      </div>
    </div>
  );
}
