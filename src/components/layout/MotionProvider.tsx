'use client';

import { MotionConfig } from 'framer-motion';
import { type ReactNode } from 'react';

// Applies reducedMotion:"user" globally — Framer Motion automatically
// respects prefers-reduced-motion for every motion.* element in the tree.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
