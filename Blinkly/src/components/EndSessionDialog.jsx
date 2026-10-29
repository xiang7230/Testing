import { useEffect, useRef } from 'react';

export default function EndSessionDialog({ onCancel, onConfirm }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirmation-dialog"
      aria-labelledby="end-session-title"
      aria-describedby="end-session-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="end-session-title">End this session?</h2>
      <p id="end-session-description">
        Monitoring will stop. You can start a new session whenever you are
        ready.
      </p>
      <div className="confirmation-dialog__actions">
        <button
          className="button button--quiet"
          type="button"
          autoFocus
          onClick={onCancel}
        >
          Keep monitoring
        </button>
        <button
          className="button button--primary"
          type="button"
          onClick={onConfirm}
        >
          Confirm end session
        </button>
      </div>
    </dialog>
  );
}
