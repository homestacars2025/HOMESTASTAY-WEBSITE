'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ease, duration } from '@/lib/motion';
import { type ReactNode } from 'react';

// Soft opacity fade on route changes. Keyed on pathname so each navigation
// triggers a fresh enter animation. Initial-load opacity starts at 0 but
// Framer animates it within one frame — imperceptible, avoids a hard cut.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: duration.fast, ease }}
    >
      {children}
    </motion.div>
  );
}
