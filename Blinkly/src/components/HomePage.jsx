import { BlinklyMark, BulbIcon, LeafDecoration } from './icons.jsx';

// General screen-comfort tips; one is shown per calendar day.
export const TIPS = [
  'Take regular breaks and look at something 20 feet away for 20 seconds.',
  'Blink fully and often. We blink less when we focus on a screen.',
  'Keep your screen about an arm’s length away from your eyes.',
  'Match your screen brightness to the light in your room.',
  'Position the top of your screen at or slightly below eye level.',
];

function tipOfTheDay(date = new Date()) {
  const dayNumber = Math.floor(date.getTime() / 86_400_000);
  return TIPS[dayNumber % TIPS.length];
}

export default function HomePage({
  state = 'IDLE',
  pending = false,
  error = '',
  elapsedLabel = '00:00',
  onStart,
  onRetry,
  onOpenMonitoring,
}) {
  const canStart = state === 'IDLE' || state === 'COMPLETED';
  const canRetry = state === 'ERROR';
  const sessionActive = !canStart && !canRetry;
  let mainAction = { label: 'Back to monitoring', onClick: onOpenMonitoring };
  if (canStart)
    mainAction = {
      label: pending ? 'Starting…' : 'Start Monitoring',
      onClick: onStart,
    };
  if (canRetry) mainAction = { label: 'Try again', onClick: onRetry };

  return (
    <div className="home">
      <div className="home__top">
        <section className="home__welcome">
          <h1>Welcome!</h1>
          <p>Let’s take care of your eyes today.</p>
        </section>
        <aside className="tip-card" aria-labelledby="tip-title">
          <h2 id="tip-title">
            <BulbIcon />
            Tip of the Day
          </h2>
          <p>{tipOfTheDay()}</p>
        </aside>
      </div>

      <section className="home__hero" aria-label="Blinkly">
        <BlinklyMark className="home__mark" />
        <p className="home__wordmark">blinkly</p>
        <p className="home__tagline">HEALTHIER SCREEN TIME</p>

        {state === 'COMPLETED' && (
          <p className="home__status">
            Session complete. Nice work looking after your eyes.
          </p>
        )}

        <button
          className="button button--primary button--large home__start"
          disabled={pending && !sessionActive}
          type="button"
          onClick={mainAction.onClick}
        >
          {mainAction.label}
          {sessionActive && (
            <span className="button__meta">{elapsedLabel}</span>
          )}
        </button>
        {error && (
          <p className="form-error home__error" role="alert">
            {error}
          </p>
        )}
      </section>

      <LeafDecoration className="home__leaf" />
    </div>
  );
}
