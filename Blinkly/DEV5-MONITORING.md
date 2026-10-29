# Monitoring, alerts and breaks (Dev 5)

## Files

| File | Purpose |
|---|---|
| `src/services/monitoring.js` | State machine, session timer, alert rules, snooze, breaks, persistence |
| `src/components/AlertModal.jsx` | Pop-up alert: Take a break / Snooze / Not now (Got it) |
| `src/components/BreakTimer.jsx` | Break countdown, End break early / Resume, End session |
| `src/components/monitoring.css` | Styles for the two components above |
| `tests/monitoring.test.mjs` | Service tests (fake clock and fake `window.Blinkly`) |
| `tests/ui/monitoring.test.jsx` | Component and integration tests |

`App.jsx` creates one controller with `createMonitoringController()` and reads
it with `useSyncExternalStore`. React never changes monitoring state directly.

## Flow

1. **Start Monitoring** → `start()` calls `createSession`, saves `SESSION_STARTED`, state `STARTING`.
2. `CameraPreview` loads the camera and models, then calls `onReady` → `MONITORING`.
3. Each frame `CameraPreview` calls `onDetection(detection, { newBlinks })`; brightness readings go to `onBrightness`.
4. The camera keeps running if the user opens Home or Profile during a session.
5. **Take a break** → `ON_BREAK`; the camera turns off and `BreakTimer` counts down.
   Ending the break returns to `MONITORING` (distance recalibrates for 2 s).
6. **End session** → saves the last measurements and `SESSION_ENDED`, calls
   `completeSession`, state `COMPLETED`. A summary is in `snapshot.lastSummary`.
7. A camera or AI failure → `ERROR` with a message; **Try again** → `STARTING`.

Session time counts active monitoring only. It does not run during start-up, pause or breaks,
and that value is saved as `durationSeconds`.

## Alert rules

| Alert | Condition | Cooldown | Event saved |
|---|---|---|---|
| Break reminder | Every `reminderIntervalMinutes` of active time | – | `BREAK_STARTED` / `ALERT_SNOOZED` when acted on |
| Low blink rate | Below 10/min for 30 s | 5 min | `BLINK_ALERT` |
| Too close | `TOO_CLOSE` for 10 s | 3 min | `DISTANCE_WARNING` |
| Possible eye rubbing | Each new `rubbingEventId` | 2 min (pop-up only) | `POSSIBLE_EYE_RUBBING` (every event) |
| Brightness | `brightnessEnabled` and 15+ points from `preferredBrightness` | 15 min | `BRIGHTNESS_SUGGESTED` |

Thresholds are in `ALERT_RULES` and are provisional; tune them in user testing.

- Events are saved even when the pop-up is suppressed; `details.alerted` records whether it was shown.
- **Snooze** silences all pop-ups for `snoozeDurationMinutes`; a snoozed break reminder returns after that time.
- **Not now** restarts the reminder interval.
- Only one pop-up shows at a time.
- `notificationType: 'system'` sends an OS notification instead of the pop-up and
  falls back to the pop-up if the OS cannot show it. The break reminder always
  appears in the app because it needs a choice.
- Face tracking off: no blink, distance or rubbing alerts. Hand tracking off: no rubbing alerts.

## Persistence

- Measurements are averaged and saved every 30 s with `saveMeasurements`, along with `updateSession` progress.
- Writes run in order. A failed write shows "Some session data could not be saved"
  and monitoring continues.
- Without `window.Blinkly` (plain browser or tests) monitoring runs without saving.

## Testing

```bash
npm test
```

Manual checks in the running app (set the reminder interval to 1 minute):
reminder pop-up, snooze, break countdown, rubbing and too-close alerts, system
notifications, and a session row in the database after ending.
