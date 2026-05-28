'use client';

import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useAuthGate } from '@/contexts/AuthGateContext';

interface SaveButtonProps {
  unitId: string;
}

export function SaveButton({ unitId }: SaveButtonProps) {
  const [saved, setSaved] = useState(false);
  const t              = useTranslations('card');
  const user           = useAuthUser();
  const { openAuthGate } = useAuthGate();

  // After returning from sign-in, resume the pending save action for this unit
  useEffect(() => {
    if (!user) return;
    try {
      const raw = sessionStorage.getItem('auth_pending_action');
      if (!raw) return;
      const action = JSON.parse(raw) as { type: string; unitId: string };
      if (action.type === 'save' && action.unitId === unitId) {
        setSaved(true);
        sessionStorage.removeItem('auth_pending_action');
      }
    } catch {
      // non-fatal
    }
  }, [user, unitId]);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (user === undefined) return; // auth state still loading
    if (!user) {
      openAuthGate({ type: 'save', unitId });
      return;
    }
    setSaved((s) => !s);
  }

  return (
    <button
      onClick={handleClick}
      aria-label={saved ? t('unsave') : t('save')}
      className="absolute top-3 end-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm transition-transform duration-[240ms] hover:scale-110 active:scale-95"
    >
      <Heart
        className={`w-4 h-4 transition-colors duration-[240ms] ${
          saved ? 'fill-stay stroke-stay' : 'stroke-ink fill-transparent'
        }`}
      />
    </button>
  );
}
