// Decorative SVG icons shared by the Blinkly screens. All are aria-hidden;
// the surrounding button or heading provides the accessible name.

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// Closed eye inside an open circle, as drawn in the homepage sketch.
export function BlinklyMark({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      strokeLinecap="round"
    >
      <path
        d="M81 25.6A42 42 0 1 0 56.3 103.8"
        stroke="#9b7cf0"
        strokeWidth="7"
      />
      <path
        d="M99.5 76.4A42 42 0 0 1 70.9 102.6"
        stroke="#d59ac0"
        strokeWidth="7"
      />
      <path d="M36 62Q60 86 84 62" stroke="#6f7fe0" strokeWidth="7" />
      <path
        d="M41 69l-4 7M50 74l-2 8M60 76v9M70 74l2 8M79 69l4 7"
        stroke="#6f7fe0"
        strokeWidth="4.5"
      />
      <path
        d="M91 31l10-8M96 43l13-4M96 55l13 3"
        stroke="#7fb0f0"
        strokeWidth="5.5"
      />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <path
        d="M9.5 3h5l.6 2.4 1.7 1 2.4-.7 2.5 4.3-1.8 1.7v2l1.8 1.7-2.5 4.3-2.4-.7-1.7 1-.6 2.4h-5L8.9 20l-1.7-1-2.4.7-2.5-4.3 1.8-1.7v-2L2.3 10l2.5-4.3 2.4.7 1.7-1L9.5 3Z"
        transform="translate(0 -0.7) scale(1 .98)"
      />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="9.5" r="3.3" />
      <path d="M5.8 18.6c1.4-2.6 3.6-3.9 6.2-3.9s4.8 1.3 6.2 3.9" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M3.5 11 12 3.8l8.5 7.2M6 9v11h4.5v-6h3v6H18V9" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </svg>
  );
}

export function BulbIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M9 18h6M10 21h4M8.2 14.5A6 6 0 1 1 15.8 14.5c-.8.7-1.3 1.6-1.3 2.5h-5c0-.9-.5-1.8-1.3-2.5Z" />
    </svg>
  );
}

// Closed eye with "z z" for the Take a break button.
export function RestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M3 13q6 5 12 0M5 14.5l-1.5 2M9 16v2.5M13 14.5l1.5 2" />
      <path d="M16 4h4l-4 4h4M13 8h2.5L13 10.5h2.5" strokeWidth="1.5" />
    </svg>
  );
}

export function PowerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...strokeProps}>
      <path d="M12 3v8M7.1 6.3a7.5 7.5 0 1 0 9.8 0" />
    </svg>
  );
}

// Green hill with a leafy sprig for the homepage corner.
export function LeafDecoration({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 260 320"
      fill="none"
    >
      <path
        d="M260 70C190 90 120 150 80 230 60 270 50 300 46 320h214Z"
        fill="#cfe9df"
      />
      <path
        d="M120 40c20 60 50 110 120 270"
        stroke="#3f8a5d"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <g fill="#9bd49b" stroke="#3f8a5d" strokeWidth="2">
        <path d="M121 42c-14-18-12-36 2-44 10 14 10 30-2 44Z" />
        <path d="M140 95c-22-4-32-20-28-36 18 4 28 18 28 36Z" />
        <path d="M150 112c4-22 20-32 36-28-4 18-18 28-36 28Z" />
        <path d="M178 175c-22 4-36-6-40-22 18-4 32 4 40 22Z" />
        <path d="M195 205c8-20 26-26 40-20-6 16-22 24-40 20Z" />
      </g>
    </svg>
  );
}
