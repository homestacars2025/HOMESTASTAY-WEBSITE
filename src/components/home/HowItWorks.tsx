import { useTranslations } from 'next-intl';
import { Search, CalendarCheck, Key } from 'lucide-react';
import { FadeUp } from '@/components/motion/FadeUp';

const STEPS = [
  { step: 1, key: 'step1', Icon: Search        },
  { step: 2, key: 'step2', Icon: CalendarCheck },
  { step: 3, key: 'step3', Icon: Key           },
] as const;

export function HowItWorks() {
  const t = useTranslations('howItWorks');

  return (
    <FadeUp>
      <section className="px-4 py-16 max-w-5xl mx-auto">
        <h2 className="text-[19px] font-medium tracking-[-0.025em] text-ink mb-10 text-center">
          {t('title')}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 relative">
          {/* Connecting line — desktop only, decorative */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-5 inset-x-[16.67%] h-px"
            style={{ backgroundColor: 'var(--rule)' }}
          />

          {STEPS.map(({ step, key, Icon }) => (
            <div key={key} className="flex flex-col items-center text-center gap-4">
              {/* Badge */}
              <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--stay)', color: '#fff' }}
              >
                <span className="text-[13px] font-medium leading-none">{step}</span>
              </div>

              <Icon size={22} strokeWidth={1.5} style={{ color: 'var(--ink-soft)' }} aria-hidden="true" />

              <div>
                <p className="text-[15px] font-medium tracking-[-0.01em] text-ink mb-1">
                  {t(`${key}.title`)}
                </p>
                <p className="text-[13px] leading-snug max-w-[180px] mx-auto" style={{ color: 'var(--mute)' }}>
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
