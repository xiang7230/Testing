# Home page, monitoring screen and shared UI

## Screens

`BlinklyApp` is the top-level UI. It shows one screen at a time:

- **Home page** (`HomePage.jsx`): welcome message, Tip of the Day, Blinkly logo and the
  Start Monitoring button. While a session is running, the button becomes
  "Back to monitoring" and shows the session time.
- **Monitoring screen** (`MonitoringScreen.jsx`): status banner with the session timer,
  blink rate, viewing distance, current brightness, and the Take a break / End session buttons.
- **User profile** (`UserProfile.jsx`): fictional read-only profile; Back returns to the
  previous screen.

The top bar has the Blinkly logo (goes home), a Home icon (on non-home screens),
Settings and Profile. Clicking Start Monitoring calls `onStart` and switches to the
monitoring screen once it succeeds. Confirming End session calls `onStop` and returns
home once it succeeds. If either action rejects, the screen stays put and shows the error.

## Preview and tests

From `assign5/Blinkly`:

```bash
npm start
npm test
```

The temporary `App.jsx` renders `AppPreview`. Its Scenario selector covers the available
monitoring states and missing data; IDLE opens on the home page and every other scenario
opens on the monitoring screen. Sample measurements are simulated;
buttons only change the preview and never start a camera or save sessions.
Sample measurements appear during monitoring, pause and breaks; other states show an em dash.
The preview timer runs during monitoring (including while you are on the home page),
freezes when paused or on break, and resets to `00:00` when the session ends.
Settings is still a temporary local preferences panel pending Dev 2 integration.

- `npm test`: shared contract tests and UI tests.
- `npm run test:ui`: UI interaction tests only (Vitest, Testing Library, jsdom).
- `npm run test:contracts`: existing Node contract tests.

jsdom tests simulate dialog methods. Check native modal focus containment, Escape,
focus restoration, layout and keyboard navigation in the running Electron app too.

## Shared CSS for teammates

`src/main.jsx` imports `src/index.css` once for the whole application. Teammates do
not need to import `app.css` to use common controls.

- `index.css`: color variables, base font/reset, focus styles, `.button`,
  `.button--primary`, `.button--quiet`, `.button--large`, `.button-spinner`,
  `.icon-button`, `.eyebrow`, `.simulated-tag`, `.demo-disclaimer`, `.field-label`,
  `.field-select`, `.number-input-wrap`, `.preference-switch`, `.switch-track`,
  `.form-error`, shared dialog styles.
- `components/app.css`: top bar, home page, monitoring screen, temporary settings
  layout, profile page and preview toolbar.
- `components/icons.jsx`: shared SVG icons, including the `BlinklyMark` logo.

Use the color variables in `index.css` instead of hex codes, for example
`var(--color-primary)`, `var(--color-text)`, `var(--color-text-muted)`,
`var(--color-surface)`, `var(--color-border)` and `var(--color-hover-background)`. The existing desktop minimum width remains 760px.

```jsx
<button className="button button--primary" type="button">Save</button>
<label className="field-label" htmlFor="choice">Notification style</label>
<select className="field-select" id="choice">...</select>
```

## Connecting real modules

Replace the temporary preview entry point with `BlinklyApp` when integrating.
`BlinklyApp` owns which screen is visible but not monitoring transitions or timers;
Dev 5 supplies state, time and callbacks. Fixtures live only in `src/preview/`.

| Prop                                          | Meaning                                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `monitoringState`                             | One of the seven states in `contracts/monitoring.mjs`; defaults to `IDLE`  |
| `detection`                                   | Detection contract object; blink rate uses `null` for unavailable readings |
| `currentBrightness`                           | Current brightness percentage (0–100), or `null` when unavailable          |
| `elapsedLabel`                                | Formatted session time supplied by the monitoring service                  |
| `monitoringError`                             | Actionable error text supplied by monitoring                               |
| `onStart`, `onTakeBreak`, `onStop`, `onRetry` | Actions; may return promises; reject to display an error                   |
| `settings`, `onSaveSettings`                  | Settings data/save callback for the temporary preferences panel            |
| `isPreview`                                   | Show simulated labels and the preview disclaimer; defaults to false        |
| `initialScreen`                               | `'home'` (default), `'monitoring'` or `'profile'`                          |

Missing numbers show an em dash; actual zero remains zero. A detection with
`source: 'simulated'` is always labelled simulated. Controls are disabled while an
action is pending, and the UI does not change the supplied state itself.

The monitoring screen confirms End session before invoking `onStop`. Dev 5 should
connect that callback directly to the end action to avoid two confirmation prompts.
Camera rendering, the break screen and real monitoring/persistence
remain integration work with the respective module owners.

Take a break is not connected in the preview: clicking it shows "Monitoring controls
are not connected yet" and leaves the timer running until Dev 5 connects `onTakeBreak`. Pause/Resume controls and the PAUSED preview scenario have been
removed; the shared PAUSED contract remains for compatibility with other modules.

Monitoring readings are blink rate (`detection.blinkRate`), viewing distance
(`detection.viewingDistanceCm`) and current brightness. Preview samples are 12/min,
25 cm and 60%. The brightness bar is read-only and does not change device brightness.
Tip of the Day rotates daily through the general comfort tips in `HomePage.jsx`.
Screen time and break counts belong to the later session summary.
