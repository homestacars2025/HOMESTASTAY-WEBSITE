// Shared motion tokens — single source of truth for all Framer Motion animations.
// All timings match the brand's "slow exhale" cadence (240ms).

export const ease = [0.25, 0, 0, 1] as const;

export const duration = {
  fast: 0.16,
  base: 0.24, // primary — the "240ms slow exhale"
  slow: 0.50, // image zoom and deliberate transitions
} as const;

export const transition = {
  base: { duration: duration.base, ease },
  slow: { duration: duration.slow, ease },
  fast: { duration: duration.fast, ease },
} as const;

// ── Scroll reveal ────────────────────────────────────────────────────────────
// Small 14px lift with opacity — feels like content breathing in
export const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: transition.base },
} as const;

// Container that staggers its children (use on the grid wrapper)
export const staggerContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
} as const;

// ── Card hover ────────────────────────────────────────────────────────────────
// Outer card: gentle 3px lift
export const cardHover = {
  rest:  { y: 0 },
  hover: { y: -3, transition: transition.base },
} as const;

// Inner image: slower zoom — child motion div inherits parent "hover" variant
export const cardImageHover = {
  rest:  { scale: 1 },
  hover: { scale: 1.03, transition: { duration: duration.slow, ease } },
} as const;

// City cards: portrait aspect, slightly less lift
export const cityCardHover = {
  rest:  { y: 0 },
  hover: { y: -2, transition: transition.base },
} as const;

// ── Modal ─────────────────────────────────────────────────────────────────────
export const modalBackdrop = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
  exit:    { opacity: 0, transition: transition.fast },
} as const;

export const modalCard = {
  hidden:  { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0, transition: transition.base },
  exit:    { opacity: 0, scale: 0.96, y: 4, transition: transition.fast },
} as const;
