import { useEffect, useRef } from 'react';
import './monitoring.css';

// Dev 5: pop-up for monitoring alerts. The parent keys it by alert.id.
export default function AlertModal({
  alert,
  snoozeMinutes = 10,
  pending = false,
  onTakeBreak,
  onSnooze,
  onDismiss,
  onAdjustBrightness,
}) {
  const dialogRef = useRef(null);
  const isReminder = alert.type === 'BREAK_REMINDER';
  const isBrightnessAlert = alert.type === 'BRIGHTNESS';

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`alert-dialog alert-dialog--${alert.type.toLowerCase()}`}
      role="alertdialog"
      aria-labelledby="alert-title"
      aria-describedby="alert-message"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss?.();
      }}
    >
      <p className="alert-dialog__eyebrow">
        {isReminder ? 'BREAK REMINDER' : 'EYE COMFORT ALERT'}
      </p>
      <h2 id="alert-title">{alert.title}</h2>
      <p id="alert-message">{alert.message}</p>
      <p className="alert-dialog__note">
        Blinkly gives comfort reminders, not medical advice.
      </p>

      <div className="alert-dialog__actions" aria-busy={pending}>
        <button
          className="button button--quiet"
          type="button"
          disabled={pending}
          onClick={onDismiss}
        >
          {isReminder ? 'Not now' : 'Got it'}
        </button>

        <button
          className="button button--quiet"
          type="button"
          disabled={pending}
          onClick={onSnooze}
        >
          Snooze {snoozeMinutes} min
        </button>

        {isBrightnessAlert ? (
          <button
            className="button button--primary"
            type="button"
            disabled={pending}
            autoFocus
            onClick={onAdjustBrightness}
          >
            Adjust brightness
          </button>
        ) : (
          <button
            className="button button--primary"
            type="button"
            disabled={pending}
            autoFocus
            onClick={onTakeBreak}
          >
            Take a break
          </button>
        )}
      </div>

    </dialog>
  );
}
