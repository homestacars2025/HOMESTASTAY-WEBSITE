'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X, LogOut, Wallet, BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Wordmark } from '@/components/brand/Wordmark';
import { NavLinks } from '@/components/home/NavLinks';
import { LanguageSwitcher } from '@/components/home/LanguageSwitcher';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuthUser } from '@/hooks/useAuthUser';
import { createClient } from '@/lib/supabase/client';

function getInitials(user: NonNullable<ReturnType<typeof useAuthUser>>): string {
  if (user === null || user === undefined) return '';
  const first = user.user_metadata?.first_name as string | undefined;
  const last  = user.user_metadata?.last_name  as string | undefined;
  if (first || last) return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return (user.email?.[0] ?? 'U').toUpperCase();
}

function getDisplayName(user: NonNullable<ReturnType<typeof useAuthUser>>): string {
  if (user === null || user === undefined) return '';
  const first = user.user_metadata?.first_name as string | undefined;
  if (first) return first;
  return user.email?.split('@')[0] ?? '';
}

export function MobileNav() {
  const t      = useTranslations('nav');
  // The account links share their labels with the desktop UserMenu — one
  // string, one namespace, so the drawer and the menu can never disagree.
  const tMenu  = useTranslations('auth.userMenu');
  const router = useRouter();
  const user   = useAuthUser();

  const [open,    setOpen]    = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydration guard — portals require the DOM
  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const close = () => setOpen(false);

  // ── Portal overlay (backdrop + drawer) ──────────────────────────────────────
  //
  // WHY createPortal: the <header> has backdrop-filter which creates a new CSS
  // containing block, trapping position:fixed descendants so they anchor to the
  // header instead of the viewport. Portalling to document.body escapes that.
  //
  const overlay = mounted
    ? createPortal(
        <>
          {/* Backdrop — always in DOM so opacity transition works */}
          <div
            aria-hidden="true"
            onClick={close}
            className={`fixed inset-0 z-[190] bg-ink/40 transition-opacity duration-[240ms] motion-reduce:transition-none ${
              open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />

          {/* Drawer panel
              LTR: anchored to right:0, hidden off-screen to the right  (+translateX)
              RTL: anchored to left:0  (end-0 = inline-end),
                   hidden off-screen to the left   (-translateX)         */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('openMenu')}
            className={`fixed top-0 end-0 z-[200] h-full w-[min(320px,90vw)]
              bg-white shadow-[0_0_48px_rgba(0,0,0,0.18)]
              flex flex-col
              transition-transform duration-[240ms] ease-in-out
              motion-reduce:transition-none
              ${open
                ? 'translate-x-0'
                : 'translate-x-full rtl:-translate-x-full'
              }`}
          >
            {/* ── Drawer header: wordmark + close ── */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-rule shrink-0">
              <Link href="/" onClick={close} aria-label="Homesta Stay — home">
                <Wordmark />
              </Link>
              <button
                type="button"
                aria-label={t('closeMenu')}
                onClick={close}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-paper-warm transition-colors duration-[240ms]"
              >
                <X className="w-5 h-5 text-ink" />
              </button>
            </div>

            {/* ── Nav links ── */}
            <div className="flex-1 overflow-y-auto px-5 py-6">
              <NavLinks orientation="vertical" onLinkClick={close} />
            </div>

            {/* ── Footer: language + auth ── */}
            <div className="px-5 pb-8 pt-4 border-t border-rule shrink-0 flex flex-col gap-3">
              <LanguageSwitcher />

              {/* Signed in */}
              {user != null && (
                <>
                  <div className="flex items-center gap-3 px-1 py-1">
                    <span className="w-8 h-8 rounded-full bg-ink text-white text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                      {getInitials(user)}
                    </span>
                    <span className="text-sm font-medium text-ink truncate">
                      {getDisplayName(user)}
                    </span>
                  </div>
                  {/* Law 5: our guests are on phones. An account surface
                      reachable only from the desktop user menu does not exist
                      for most of the people who own one — so this drawer
                      carries the SAME links as UserMenu, in the same order.
                      Divergence here is how a feature quietly goes missing on
                      the device it was built for. */}
                  <Link
                    href="/my-bookings"
                    onClick={close}
                    className="w-full flex items-center justify-center gap-2 rounded-[999px] border border-rule text-sm font-medium text-ink py-3 hover:bg-paper-warm transition-colors duration-[240ms]"
                  >
                    <BookOpen className="w-4 h-4 text-mute shrink-0" />
                    {tMenu('myBookings')}
                  </Link>
                  <Link
                    href="/wallet"
                    onClick={close}
                    className="w-full flex items-center justify-center gap-2 rounded-[999px] border border-rule text-sm font-medium text-ink py-3 hover:bg-paper-warm transition-colors duration-[240ms]"
                  >
                    <Wallet className="w-4 h-4 text-mute shrink-0" />
                    {tMenu('wallet')}
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      const supabase = createClient();
                      await supabase.auth.signOut();
                      close();
                      router.push('/');
                      router.refresh();
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-[999px] border border-rule text-sm font-medium text-ink py-3 hover:bg-paper-warm transition-colors duration-[240ms]"
                  >
                    <LogOut className="w-4 h-4 text-mute shrink-0" />
                    {t('signOut')}
                  </button>
                </>
              )}

              {/* Signed out */}
              {user === null && (
                <>
                  <Link
                    href="/sign-up"
                    onClick={close}
                    className="w-full rounded-[999px] bg-ink text-white text-sm font-medium py-3 text-center transition-opacity duration-[240ms] hover:opacity-80 active:opacity-70"
                  >
                    {t('createAccount')}
                  </Link>
                  <Link
                    href="/sign-in"
                    onClick={close}
                    className="w-full rounded-[999px] border border-rule text-sm font-medium text-ink py-3 text-center hover:bg-paper-warm transition-colors duration-[240ms]"
                  >
                    {t('signIn')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div className="md:hidden">
      {/* Hamburger trigger */}
      <button
        type="button"
        aria-label={t('openMenu')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-paper-warm transition-colors duration-[240ms]"
      >
        <Menu className="w-5 h-5 text-ink" />
      </button>

      {overlay}
    </div>
  );
}
