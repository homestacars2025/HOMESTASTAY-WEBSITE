import { useTranslations } from 'next-intl';
import { Zap, ShieldCheck, MessageCircle, Tag } from 'lucide-react';
import { FadeUp } from '@/components/motion/FadeUp';

const PROPS = [
  { key: 'booking',  Icon: Zap           },
  { key: 'verified', Icon: ShieldCheck   },
  { key: 'support',  Icon: MessageCircle },
  { key: 'pricing',  Icon: Tag           },
] as const;

export function WhyHomesta() {
  const t = useTranslations('whyHomesta');

  return (
    <FadeUp>
      <section className="px-4 py-16 max-w-5xl mx-auto">
        <h2 className="text-[19px] font-medium tracking-[-0.025em] text-ink mb-10 text-center">
          {t('title')}
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {PROPS.map(({ key, Icon }) => (
            <div key={key} className="flex flex-col gap-3">
              <div
                className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--paper-warm)' }}
              >
                <Icon size={18} strokeWidth={1.75} style={{ color: 'var(--stay)' }} aria-hidden="true" />
              </div>
              <div>
                <p className="text-[15px] font-medium tracking-[-0.01em] text-ink leading-snug mb-1">
                  {t(`${key}.title`)}
                </p>
                <p className="text-[13px] leading-snug" style={{ color: 'var(--mute)' }}>
                  {t(`${key}.text`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </FadeUp>
  );
}
