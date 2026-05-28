'use client';

import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/motion';
import { type ReactNode } from 'react';

interface FadeUpProps {
  children: ReactNode;
  className?: string;
  /** Extra delay in seconds (0.08 per stagger step works well) */
  delay?: number;
}

export function FadeUp({ children, className, delay = 0 }: FadeUpProps) {
  const variant = delay
    ? {
        hidden:  fadeUp.hidden,
        visible: { ...fadeUp.visible, transition: { ...fadeUp.visible.transition, delay } },
      }
    : fadeUp;

  return (
    <motion.div
      variants={variant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-32px' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
