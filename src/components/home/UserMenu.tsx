'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, ChevronDown, BookOpen } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface UserMenuProps {
  user: User;
}

function getInitials(user: User): string {
  const first = user.user_metadata?.first_name as string | undefined;
  const last  = user.user_metadata?.last_name  as string | undefined;
  if (first || last) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }
  return (user.email?.[0] ?? 'U').toUpperCase();
}

function getDisplayName(user: User): string {
  const first = user.user_metadata?.first_name as string | undefined;
  if (first) return first;
  return user.email?.split('@')[0] ?? '';
}

export function UserMenu({ user }: UserMenuProps) {
  const t        = useTranslations('auth.userMenu');
  const router   = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/');
    router.refresh();
  }

  const initials     = getInitials(user);
  const displayName  = getDisplayName(user);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[999px] px-3 py-1.5 hover:bg-paper-warm transition-colors duration-[240ms]"
      >
        <span className="w-7 h-7 rounded-full bg-ink text-white text-[11px] font-semibold flex items-center justify-center shrink-0 select-none">
          {initials}
        </span>
        <span className="text-sm font-medium text-ink max-w-[80px] truncate hidden sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-mute shrink-0 transition-transform duration-[240ms] ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full end-0 mt-2 w-48 bg-white border border-rule rounded-[14px] shadow-[0_4px_24px_rgba(0,0,0,0.10)] py-1.5 z-50">
          <Link
            href="/my-bookings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper-warm transition-colors duration-[240ms]"
          >
            <BookOpen className="w-4 h-4 text-mute shrink-0" />
            {t('myBookings')}
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-paper-warm transition-colors duration-[240ms] text-start"
          >
            <LogOut className="w-4 h-4 text-mute shrink-0" />
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
