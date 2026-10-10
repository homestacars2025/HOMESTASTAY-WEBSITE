'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFavorites } from '@/contexts/FavoritesContext';

interface SaveButtonProps {
  unitId: string;
  /**
   * Whether the button positions itself over the photo (the listing-card case)
   * or lays out in normal flow. False when a parent groups it with the share
   * button in one row — two absolutely positioned siblings would stack.
   */
  floating?: boolean;
}

/**
 * The ❤. Saves for everyone — signed out it is kept in this browser and moved
 * into the account at sign-in (see FavoritesContext) — so it never asks a guest
 * to sign in just to remember a place.
 */
export function SaveButton({ unitId, floating = true }: SaveButtonProps) {
  const t = useTranslations('card');
  const { has, toggle } = useFavorites();
  const saved = has(unitId);

  function handleClick(e: React.MouseEvent) {
    // The button sits inside the card's link: saving must not open the unit.
    e.preventDefault();
    e.stopPropagation();
    toggle(unitId);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? t('unsave') : t('save')}
      className={`${floating ? 'absolute top-3 end-3 ' : ''}w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-transform duration-[240ms] hover:scale-110 active:scale-95`}
    >
      <Heart
        className={`w-4 h-4 transition-colors duration-[240ms] ${
          saved ? 'fill-stay stroke-stay' : 'stroke-ink fill-transparent'
        }`}
      />
    </button>
  );
}
