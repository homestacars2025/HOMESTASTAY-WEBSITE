'use client';

import { useState, useEffect } from 'react';
import { Wordmark } from '@/components/brand/Wordmark';
import { LanguageSwitcher } from '@/components/home/LanguageSwitcher';
import { NavLinks } from '@/components/home/NavLinks';
import { MobileNav } from '@/components/home/MobileNav';
import { HeaderAuth } from '@/components/home/HeaderAuth';
import { Link } from '@/i18n/navigation';

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-rule transition-[background-color,backdrop-filter,box-shadow] duration-[240ms] ${
        scrolled
          ? 'bg-paper/95 backdrop-blur-xl shadow-[0_1px_16px_rgba(0,0,0,0.07)]'
          : 'bg-paper/80 backdrop-blur-md shadow-none'
      }`}
    >
      {/*
        Mobile: flex justify-between (logo ← → hamburger)
        Desktop: 3-col grid [1fr auto 1fr] — nav is truly centered regardless of
        left/right widths; grid column order reverses automatically in RTL.
      */}
      <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr]">

        {/* LEFT col: wordmark */}
        <div className="flex items-center">
          <Link href="/" className="group">
            <Wordmark className="transition-opacity duration-[240ms] group-hover:opacity-80" />
          </Link>
        </div>

        {/* CENTER col: nav links (desktop only) */}
        <div className="hidden md:flex justify-center">
          <NavLinks orientation="horizontal" />
        </div>

        {/* RIGHT col: language switcher + sign in (desktop) | hamburger (mobile) */}
        <div className="flex items-center justify-end gap-2">
          <div className="hidden md:flex items-center gap-2">
            <LanguageSwitcher />
            <HeaderAuth />
          </div>
          <MobileNav />
        </div>

      </div>
    </header>
  );
}
