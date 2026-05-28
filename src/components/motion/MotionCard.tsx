'use client';

import { motion } from 'framer-motion';
import { ease, duration } from '@/lib/motion';
import { type ReactNode } from 'react';

// Combines scroll-reveal (whileInView) with hover lift in a single wrapper.
// Children motion.divs can participate in the "hover" variant for image zoom.
const variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0,  transition: { duration: duration.base, ease } },
  hover:   { y: -3,             transition: { duration: duration.base, ease } },
};

interface MotionCardProps {
  children: ReactNode;
  className?: string;
}

export function MotionCard({ children, className }: MotionCardProps) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-32px' }}
      whileHover="hover"
      className={className}
    >
      {children}
    </motion.div>
  );
}
