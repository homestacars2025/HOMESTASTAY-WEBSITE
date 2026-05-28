'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface NavLinksProps {
  orientation?: 'horizontal' | 'vertical';
  onLinkClick?: () => void;
}

const links = [
  { href: '/stays' as const, key: 'stays' },
  { href: '/blog' as const, key: 'blog' },
  { href: '/contact' as const, key: 'contact' },
] as const;

export function NavLinks({ orientation = 'horizontal', onLinkClick }: NavLinksProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const baseLink = orientation === 'horizontal'
    ? 'text-sm transition-colors duration-[240ms]'
    : 'text-base py-2 transition-colors duration-[240ms]';

  return (
    <nav
      className={cn(
        orientation === 'horizontal'
          ? 'hidden md:flex items-center gap-6'
          : 'flex flex-col gap-1'
      )}
      aria-label="Main navigation"
    >
      {links.map(({ href, key }) => (
        <Link
          key={key}
          href={href}
          onClick={onLinkClick}
          className={cn(
            baseLink,
            isActive(href)
              ? 'text-ink font-medium'
              : 'text-mute hover:text-ink-soft'
          )}
        >
          {t(key)}
        </Link>
      ))}

      {/* Become a host — slightly emphasized */}
      <Link
        href="/host"
        onClick={onLinkClick}
        className={cn(
          orientation === 'horizontal'
            ? 'text-sm font-medium border border-rule rounded-[999px] px-3.5 py-1.5 transition-colors duration-[240ms]'
            : 'text-base font-medium py-2 transition-colors duration-[240ms]',
          isActive('/host')
            ? 'text-ink border-ink'
            : 'text-ink-soft hover:text-ink hover:border-ink-soft'
        )}
      >
        {t('becomeHost')}
      </Link>
    </nav>
  );
}
