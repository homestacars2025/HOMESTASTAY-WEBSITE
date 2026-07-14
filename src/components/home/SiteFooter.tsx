import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Instagram, Facebook } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { CONTACT_EMAIL, SOCIAL_LINKS } from '@/lib/config/social';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

const SOCIAL_ICONS = {
  instagram: Instagram,
  facebook:  Facebook,
  whatsapp:  WhatsAppIcon,
} as const;

export function SiteFooter() {
  const t      = useTranslations('footer');
  const tNav   = useTranslations('nav');
  const locale = useLocale();

  return (
    <footer className="bg-ink text-mute">
      <div className="max-w-5xl mx-auto px-4 py-14 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">

          {/* Brand column */}
          <div className="md:col-span-1 flex flex-col gap-4">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2"
              aria-label="Homesta Stay — home"
            >
              <BrandMark className="text-[28px] text-stay" />
              <span
                className="font-medium tracking-[-0.045em] text-[17px] leading-none"
                style={{ fontFeatureSettings: '"ss01","cv11","cv06"' }}
              >
                <span className="text-white">homesta</span>
                {' '}
                <span className="text-stay">stay</span>
              </span>
            </Link>

            <p className="text-[13px] leading-snug max-w-[200px]">
              {t('tagline')}
            </p>

            <p className="text-[12px] mt-auto text-hairline-dark">
              {t('copyright')}
            </p>
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-3">
            <ColHead>{t('quickLinks')}</ColHead>
            <FooterLink href={`/${locale}/stays`}>{tNav('stays')}</FooterLink>
            <FooterLink href={`/${locale}/blog`}>{tNav('blog')}</FooterLink>
            <FooterLink href={`/${locale}/contact`}>{tNav('contact')}</FooterLink>
            <FooterLink href={`/${locale}/host`}>{tNav('becomeHost')}</FooterLink>
          </div>

          {/* Company / legal */}
          <div className="flex flex-col gap-3">
            <ColHead>{t('company')}</ColHead>
            <FooterLink href={`/${locale}/about`}>{t('about')}</FooterLink>
            <FooterLink href={`/${locale}/terms`}>{t('terms')}</FooterLink>
            <FooterLink href={`/${locale}/privacy`}>{t('privacy')}</FooterLink>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-3">
            <ColHead>{t('contactUs')}</ColHead>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[14px] leading-snug text-mute hover:text-white transition-colors duration-[240ms]"
            >
              {CONTACT_EMAIL}
            </a>
            <div className="flex flex-row gap-2 mt-1">
              {SOCIAL_LINKS.filter((l) => !l.isEmail).map((link) => {
                const Icon      = SOCIAL_ICONS[link.key as keyof typeof SOCIAL_ICONS];
                const ariaLabel = t(`social${link.key.charAt(0).toUpperCase()}${link.key.slice(1)}` as 'socialInstagram' | 'socialFacebook' | 'socialWhatsapp');
                const isLive    = !link.isPlaceholder;
                return (
                  <a
                    key={link.key}
                    href={link.href}
                    aria-label={ariaLabel}
                    {...(isLive ? { target: '_blank', rel: 'noopener noreferrer' } : { 'aria-disabled': 'true' })}
                    className="w-9 h-9 flex items-center justify-center rounded-full border border-hairline-dark text-mute hover:text-white hover:border-white/20 hover:bg-white/8 transition-colors duration-[240ms]"
                  >
                    <Icon className="w-[17px] h-[17px]" />
                  </a>
                );
              })}
            </div>
          </div>

        </div>

        {/* Company / legal registration info */}
        <div className="mt-12 pt-8 border-t border-hairline-dark">
          <ColHead>{t('legalInfo')}</ColHead>
          <address className="not-italic mt-3 text-[12px] leading-relaxed max-w-3xl space-y-0.5">
            <p className="text-white/70">
              HOMESTA GRUP DANIŞMANLIK HİZMETLERİ LİMİTED ŞİRKETİ
            </p>
            <p>Vergi Dairesi: BAŞAKŞEHİR</p>
            <p>KAYABAŞI MAH. GAZİ YAŞARGİL CAD. T2 BLOK NO: 2 Y BAŞAKŞEHİR / İSTANBUL</p>
          </address>
        </div>
      </div>
    </footer>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.08em] font-medium text-white/40 mb-1">
      {children}
    </p>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[14px] leading-snug text-mute hover:text-white transition-colors duration-[240ms]"
    >
      {children}
    </Link>
  );
}
