'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Share, X, Link2, Check, Mail } from 'lucide-react';
import { modalBackdrop, modalCard } from '@/lib/motion';

/** Read at module scope: NEXT_PUBLIC_* is inlined at build time. */
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

interface ShareButtonProps {
  /** Absolute, canonical URL of the unit — never a relative path. */
  url: string;
  /** The listing's name, used as the share subject. */
  title: string;
  /** One-line summary: city · price · type, the same copy the OG card carries. */
  text: string;
}

/**
 * Share affordance for a listing, sitting beside the save heart.
 *
 * TWO PATHS: THE PHONE'S OWN SHEET, OR OURS
 *   On a phone, navigator.share hands the link to the system: the guest gets
 *   their own apps, in their own order, including ones we would never think to
 *   list. On a desktop they get the panel below.
 *
 *   The test is `(pointer: coarse)` AND navigator.share, not navigator.share
 *   alone — verified in a real browser, not assumed. Chrome on macOS and
 *   Windows implements the API and opens the OS share dialog, which on a laptop
 *   is a worse experience than a row of labelled links and cannot offer "copy
 *   link". Capability detection alone silently routed every desktop Chrome user
 *   into that dialog.
 *
 * navigator.share must be called synchronously from the click for the browser
 * to treat it as user-activated; anything awaited first loses the gesture and
 * the sheet silently refuses to open.
 */
export function ShareButton({ url, title, text }: ShareButtonProps) {
  const t = useTranslations('unit.share');
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const touchDevice =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

    if (touchDevice && typeof navigator !== 'undefined' && navigator.share) {
      // A cancelled share sheet rejects with AbortError. That is the guest
      // changing their mind, not a failure, so it is swallowed rather than
      // falling through to the desktop sheet — which would reopen the very
      // thing they just dismissed.
      navigator.share({ title, text, url }).catch(() => {});
      return;
    }

    setSheetOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={t('action')}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-transform duration-[240ms] hover:scale-110 active:scale-95"
      >
        <Share className="w-4 h-4 stroke-ink" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {sheetOpen && (
          <ShareSheet url={url} title={title} text={text} onClose={() => setSheetOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

/** One row in the fallback sheet. */
type ShareTarget = {
  key: string;
  label: string;
  href: string;
  /** Brand glyph, drawn as a path so no icon package grows for six logos. */
  icon: React.ReactNode;
};

function ShareSheet({
  url,
  title,
  text,
  onClose,
}: ShareButtonProps & { onClose: () => void }) {
  const t = useTranslations('unit.share');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and blocked outright in some embedded
      // browsers. Selecting the text is the honest fallback.
      window.prompt(t('copyManual'), url);
    }
  }, [url, t]);

  // Encoded once: every target below takes the same two values, and encoding
  // at each call site is how one of them ends up with a raw & in the query.
  const eUrl = encodeURIComponent(url);
  const eText = encodeURIComponent(text ? `${title} — ${text}` : title);
  const eTitle = encodeURIComponent(title);

  const targets: ShareTarget[] = [
    {
      key: 'whatsapp',
      label: t('whatsapp'),
      href: `https://wa.me/?text=${eText}%20${eUrl}`,
      icon: (
        <path d="M12.04 2A9.9 9.9 0 0 0 2.1 11.9a9.8 9.8 0 0 0 1.35 4.95L2 22l5.3-1.38a9.9 9.9 0 0 0 4.74 1.2h.01a9.9 9.9 0 0 0 9.9-9.9A9.9 9.9 0 0 0 12.04 2Zm5.8 14.03c-.24.68-1.42 1.31-1.95 1.36-.52.05-1 .24-3.38-.7-2.85-1.13-4.65-4.05-4.79-4.24-.14-.19-1.14-1.52-1.14-2.9s.72-2.06.98-2.34c.26-.28.57-.35.76-.35h.54c.18 0 .42-.07.65.5.24.57.81 1.98.88 2.12.07.14.12.31.02.5-.09.19-.14.31-.28.47l-.42.49c-.14.14-.29.3-.12.58.16.28.73 1.2 1.56 1.94 1.07.95 1.97 1.25 2.25 1.39.28.14.45.12.61-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.64-.14.26.09 1.66.78 1.95.92.28.14.47.21.54.33.07.12.07.68-.17 1.35Z" />
      ),
    },
    {
      key: 'facebook',
      label: t('facebook'),
      href: `https://www.facebook.com/sharer/sharer.php?u=${eUrl}`,
      icon: (
        <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
      ),
    },
    {
      key: 'twitter',
      label: t('twitter'),
      href: `https://twitter.com/intent/tweet?url=${eUrl}&text=${eText}`,
      icon: (
        <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.22-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
      ),
    },
    {
      key: 'telegram',
      label: t('telegram'),
      href: `https://t.me/share/url?url=${eUrl}&text=${eText}`,
      icon: (
        <path d="M21.94 4.6 18.6 20.3c-.25 1.11-.91 1.39-1.84.86l-5.09-3.75-2.46 2.36c-.27.27-.5.5-1.03.5l.37-5.2 9.47-8.56c.41-.37-.09-.57-.64-.2L5.68 13.68.65 12.1c-1.09-.34-1.11-1.09.23-1.62L20.53 2.9c.91-.34 1.7.2 1.41 1.7Z" />
      ),
    },
    // Messenger's web Send Dialog is the only target that cannot be a plain
    // link: Facebook requires a registered app id and rejects the request
    // without one. Rather than ship a button that opens an error page, it
    // appears only once NEXT_PUBLIC_FACEBOOK_APP_ID is set. On phones this
    // costs nothing — the native sheet already lists Messenger.
    ...(FACEBOOK_APP_ID
      ? [{
          key: 'messenger',
          label: t('messenger'),
          href: `https://www.facebook.com/dialog/send?app_id=${FACEBOOK_APP_ID}&link=${eUrl}&redirect_uri=${eUrl}`,
          icon: (
            <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.19.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.7.36-.9.54-.05 1.07.29 2.2.45 3.39.45 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2Zm6 7.46-2.94 4.66c-.47.74-1.47.93-2.18.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.16 2.4c-.42.32-.97-.18-.69-.63l2.94-4.66c.47-.74 1.47-.93 2.18-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.16-2.4c.42-.32.97.18.69.63Z" />
          ),
        }]
      : []),
    {
      key: 'email',
      label: t('email'),
      href: `mailto:?subject=${eTitle}&body=${eText}%20${eUrl}`,
      icon: null, // lucide Mail, rendered below — an envelope is not a brand mark
    },
  ];

  const sheet = (
    <motion.div
      variants={modalBackdrop}
      initial="hidden"
      animate="visible"
      exit="hidden"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-ink/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
    >
      <motion.div
        variants={modalCard}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-paper rounded-[14px] border border-rule shadow-[0_8px_40px_rgba(0,0,0,0.18)] p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium text-ink tracking-[-0.015em]">{t('title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="w-8 h-8 -me-2 flex items-center justify-center rounded-full hover:bg-paper-warm transition-colors duration-[240ms]"
          >
            <X className="w-4 h-4 stroke-ink-soft" aria-hidden="true" />
          </button>
        </div>

        {/* Copy link — first, because it is the one that works everywhere. */}
        <button
          type="button"
          onClick={copy}
          className="w-full min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-[14px] border border-rule hover:bg-paper-warm transition-colors duration-[240ms] text-start"
        >
          <span className="w-5 h-5 flex items-center justify-center shrink-0">
            {copied
              ? <Check className="w-5 h-5 stroke-stay" aria-hidden="true" />
              : <Link2 className="w-5 h-5 stroke-ink" aria-hidden="true" />}
          </span>
          <span className={`text-sm ${copied ? 'text-stay' : 'text-ink'}`}>
            {copied ? t('copied') : t('copyLink')}
          </span>
        </button>

        <div className="mt-3 grid grid-cols-1 gap-2">
          {targets.map((target) => (
            <a
              key={target.key}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] flex items-center gap-3 px-4 py-3 rounded-[14px] border border-rule hover:bg-paper-warm transition-colors duration-[240ms]"
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0">
                {target.icon ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-ink" aria-hidden="true">
                    {target.icon}
                  </svg>
                ) : (
                  <Mail className="w-5 h-5 stroke-ink" aria-hidden="true" />
                )}
              </span>
              <span className="text-sm text-ink">{target.label}</span>
            </a>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(sheet, document.body);
}
