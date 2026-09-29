import type { ReactNode } from 'react';

/* ── Cinema icons ──────────────────────────────────────────────────────────────
   One line-icon set for the landing page and the Mac app's pages, drawn from the film set rather than the
   office: a slate for notes, a script for the transcript, a viewfinder for a
   capture, a ticket for the price. Every shape is 24 units, a 1.5 stroke in
   currentColor, and carries pathLength="1" so a revealed section can draw its
   icons on with one dash offset. */

export type IconName =
  | 'clapper' | 'reel' | 'strip' | 'subtitles' | 'viewfinder' | 'script' | 'projector'
  | 'camera' | 'ticket' | 'seat' | 'chair' | 'mic' | 'rewind' | 'retake' | 'canister'
  | 'playhead' | 'record' | 'storyboard' | 'chart' | 'megaphone' | 'laptop' | 'spark'
  | 'check' | 'cut' | 'code';

const P = { pathLength: 1 } as const;

const SHAPES: Record<IconName, ReactNode> = {
  clapper: <>
    <path {...P} d="M3.5 10.5h17v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
    <path {...P} d="M3.5 10.5 3 7.5l17-3 .5 3z" />
    <path {...P} d="M8 6.6l2 2.8M13 5.7l2 2.8" />
    <path {...P} d="M7 15h6" />
  </>,
  reel: <>
    <circle {...P} cx="11" cy="11" r="8" />
    <circle {...P} cx="11" cy="11" r="1.3" />
    <circle {...P} cx="11" cy="6.3" r="1.8" />
    <circle {...P} cx="15.5" cy="12.5" r="1.8" />
    <circle {...P} cx="6.5" cy="12.5" r="1.8" />
    <path {...P} d="M11 19h10" />
  </>,
  strip: <>
    <rect {...P} x="5" y="3" width="14" height="18" rx="1.5" />
    <path {...P} d="M8.5 3v18M15.5 3v18M8.5 12h7" />
    <path {...P} d="M5 7h3.5M5 12h3.5M5 17h3.5M15.5 7H19M15.5 12H19M15.5 17H19" />
  </>,
  subtitles: <>
    <rect {...P} x="3" y="4.5" width="18" height="15" rx="2" />
    <path {...P} d="M7 13.5h10M9 16.5h6" />
  </>,
  viewfinder: <>
    <path {...P} d="M4 8.5V5a1 1 0 0 1 1-1h3.5M15.5 4H19a1 1 0 0 1 1 1v3.5M20 15.5V19a1 1 0 0 1-1 1h-3.5M8.5 20H5a1 1 0 0 1-1-1v-3.5" />
    <circle {...P} cx="12" cy="12" r="3" />
  </>,
  script: <>
    <path {...P} d="M6 3h8l4.5 4.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path {...P} d="M14 3v4.5h4.5" />
    <path {...P} d="M9.5 11h5M8 14.5h8M10 18h4" />
  </>,
  projector: <>
    <circle {...P} cx="6.5" cy="5.5" r="2.5" />
    <circle {...P} cx="12" cy="5.5" r="2.5" />
    <rect {...P} x="3" y="9" width="12" height="8" rx="1.5" />
    <path {...P} d="M15 11.5l6-2.5M15 14.5l6 2.5M6 17l-1.5 3.5M12 17l1.5 3.5" />
  </>,
  camera: <>
    <circle {...P} cx="6.5" cy="6" r="2.5" />
    <circle {...P} cx="12.5" cy="6" r="2.5" />
    <rect {...P} x="3" y="10" width="12" height="9" rx="1.5" />
    <path {...P} d="M15 13l5.5-3v9L15 16" />
  </>,
  ticket: <>
    <path {...P} d="M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1z" />
    <path {...P} d="M15 7.5v1.5M15 11.25v1.5M15 15v1.5" />
  </>,
  seat: <>
    <path {...P} d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
    <path {...P} d="M3.5 11h17v5h-17z" />
    <path {...P} d="M6 16v4M18 16v4" />
  </>,
  chair: <>
    <path {...P} d="M6 3v10M18 3v10M6 5h12M6 9h12M4.5 13h15" />
    <path {...P} d="M7 13l10 8M17 13 7 21" />
  </>,
  mic: <>
    <rect {...P} x="9" y="3" width="6" height="11" rx="3" />
    <path {...P} d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </>,
  rewind: <>
    <path {...P} d="M11 7v10l-7-5z" />
    <path {...P} d="M20 7v10l-7-5z" />
  </>,
  retake: <>
    <path {...P} d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path {...P} d="M4.5 3.5v3.7h3.7" />
    <path {...P} d="M10.5 9.5v5l4-2.5z" />
  </>,
  canister: <>
    <ellipse {...P} cx="10" cy="6" rx="6" ry="2.2" />
    <path {...P} d="M4 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6" />
    <path {...P} d="M16 12.5h4.5v3.5H16" />
  </>,
  playhead: <>
    <path {...P} d="M8 3h8l-4 4.5z" />
    <path {...P} d="M12 7.5V21" />
    <path {...P} d="M3 14h5M16 14h5M3 18h5M16 18h5" />
  </>,
  record: <>
    <circle {...P} cx="12" cy="12" r="8.5" />
    <circle {...P} cx="12" cy="12" r="3.5" />
  </>,
  storyboard: <>
    <rect {...P} x="3" y="4" width="8" height="7" rx="1" />
    <rect {...P} x="13" y="4" width="8" height="7" rx="1" />
    <rect {...P} x="3" y="13" width="8" height="7" rx="1" />
    <rect {...P} x="13" y="13" width="8" height="7" rx="1" />
  </>,
  chart: <>
    <rect {...P} x="3" y="4" width="18" height="16" rx="1.5" />
    <path {...P} d="M7.5 16v-3M12 16V9M16.5 16v-5" />
  </>,
  megaphone: <>
    <path {...P} d="M3.5 10v4a1 1 0 0 0 1 1h2l8.5 4.5v-15L6.5 9h-2a1 1 0 0 0-1 1z" />
    <path {...P} d="M18.5 9a4 4 0 0 1 0 6" />
  </>,
  laptop: <>
    <rect {...P} x="5" y="5" width="14" height="10" rx="1.5" />
    <path {...P} d="M3 19h18" />
  </>,
  spark: <>
    <path {...P} d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z" />
    <path {...P} d="M18.5 16v4M16.5 18h4" />
  </>,
  check: <path {...P} d="M5 12.5l4.5 4.5L19 7.5" />,
  cut: <>
    <circle {...P} cx="6.5" cy="17" r="2.5" />
    <circle {...P} cx="17.5" cy="17" r="2.5" />
    <path {...P} d="M8.3 15.2 18 4M15.7 15.2 6 4" />
  </>,
  code: <>
    <path {...P} d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14" />
  </>,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `ci ${className}` : 'ci'} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {SHAPES[name]}
    </svg>
  );
}

/** An icon on its own tile: the frame the product draws round a selection, in miniature. */
export function IconTile({ name, className }: { name: IconName; className?: string }) {
  return (
    <span className={className ? `ci-tile ${className}` : 'ci-tile'} aria-hidden>
      <Icon name={name} />
      <i /><i /><i /><i />
    </span>
  );
}
