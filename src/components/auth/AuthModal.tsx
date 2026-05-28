'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { X } from 'lucide-react';
import { modalBackdrop, modalCard } from '@/lib/motion';
import type { PendingAction } from '@/contexts/AuthGateContext';

interface AuthModalProps {
  pendingAction: PendingAction;
  onClose: () => void;
}

export function AuthModal({ pendingAction, onClose }: AuthModalProps) {
  const t        = useTranslations('auth.authGate');
  const router   = useRouter();
  const pathname = usePathname();

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function navigate(dest: '/sign-in' | '/sign-up') {
    sessionStorage.setItem('auth_pending_action', JSON.stringify(pendingAction));
    const returnUrl = encodeURIComponent(pathname);
    onClose();
    router.push(`${dest}?returnUrl=${returnUrl}`);
  }

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        className="fixed inset-0 z-[200] flex items-center justify-center px-4"
        variants={modalBackdrop}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          aria-hidden="true"
          onClick={onClose}
        />

        {/* Card */}
        <motion.div
          variants={modalCard}
          className="relative z-10 w-full max-w-[380px] bg-paper border border-rule rounded-[14px] shadow-[0_8px_40px_rgba(0,0,0,0.18)] p-8 flex flex-col gap-6"
        >
          {/* Close button — end-aligned, RTL-aware */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center rounded-full text-mute hover:text-ink hover:bg-paper-warm transition-colors duration-[240ms]"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Copy */}
          <div className="text-center pt-2">
            <h2
              id="auth-gate-title"
              className="text-[1.25rem] font-medium tracking-[-0.03em] text-ink mb-2 leading-snug"
            >
              {t('title')}
            </h2>
            <p className="text-sm text-mute leading-relaxed">{t('subtitle')}</p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/sign-up')}
              className="w-full rounded-[999px] bg-ink text-white text-sm font-medium py-3 transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70"
            >
              {t('createAccount')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/sign-in')}
              className="w-full rounded-[999px] border border-rule text-sm font-medium py-3 text-ink transition-colors duration-[240ms] hover:bg-paper-warm"
            >
              {t('signIn')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
