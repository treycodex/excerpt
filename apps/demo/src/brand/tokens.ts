/**
 * The film's palette and type, copied from the product rather than invented:
 * the site's cinema ground (apps/web/src/views/landing.css `.lp`), the app's paper
 * (apps/editor/src/views/home.css), the one ember accent, and the caption style
 * the Mac app draws (packages/ui/src/tokens.css `--cap-*`).
 */
export const C = {
  ground: '#0E0F0D',
  raise: '#171913',
  hair: '#24271E',
  edge: '#363A2D',
  ink: '#EDECDB',
  dim: '#A8AA9B',
  faint: '#7C7E70',
  paper: '#F1F0DD',
  paperInk: '#24281F',
  ember: '#FF4D0F',
  beam: 'rgba(247, 223, 104, .075)',
} as const;

export const F = {
  sans: '"Archivo", -apple-system, "Helvetica Neue", sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  caption: '"Helvetica Neue", Helvetica, Arial, sans-serif',
} as const;

/** The site's `--ease-soft`, `--ease-cine`, as Remotion easing input. */
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;
export const EASE_CINE = [0.77, 0, 0.18, 1] as const;

export const FPS = 30;
export const W = 1920;
export const H = 1080;
