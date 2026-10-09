'use client';

import { useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

/** Loads Cloudflare's script once per page, only where a widget is shown. */
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile script failed')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string;
  /** A fresh token, or null when it expired / failed / was used. */
  onToken: (token: string | null) => void;
  action?: string;
  /** Bump to get a new token after one was spent (tokens are single-use). */
  resetSignal?: number;
}

/**
 * The human check before anything that sends an SMS.
 *
 * appearance 'interaction-only': most people never see it — Cloudflare decides
 * silently — and only a suspicious visitor gets the checkbox. Rendered in the
 * page's language. The token goes to the server action, which verifies it;
 * nothing here is trusted on its own.
 */
export function Turnstile({ siteKey, onToken, action, resetSignal = 0 }: TurnstileProps) {
  const locale = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCb = useRef(onToken);
  tokenCb.current = onToken;

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          theme: 'light',
          language: locale,
          callback: (t: string) => tokenCb.current(t),
          'expired-callback': () => tokenCb.current(null),
          'error-callback': () => tokenCb.current(null),
        });
      })
      .catch(() => tokenCb.current(null));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action, locale]);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      tokenCb.current(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  return <div ref={box} className="flex justify-center empty:hidden" />;
}
