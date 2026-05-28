import { Header } from '@/components/home/Header';
import { Link } from '@/i18n/navigation';
import { FadeUp } from '@/components/motion/FadeUp';

export interface LegalSection {
  id: string;
  title: string;
  body: string;
}

interface LegalPageProps {
  heading: string;
  lastUpdated: string;
  intro: string;
  tocTitle: string;
  sections: LegalSection[];
  crossLinkLabel: string;
  crossLinkHref: '/terms' | '/privacy';
  crossLinkPrefix: string;
}

export function LegalPage({
  heading,
  lastUpdated,
  intro,
  tocTitle,
  sections,
  crossLinkLabel,
  crossLinkHref,
  crossLinkPrefix,
}: LegalPageProps) {
  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main>
        {/* Hero */}
        <FadeUp>
          <section className="max-w-[720px] mx-auto px-4 pt-16 pb-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute mb-5">
              homestastay.com
            </p>
            <h1 className="text-[clamp(2rem,6vw,3rem)] font-medium tracking-[-0.04em] leading-[0.93] text-ink mb-5">
              {heading}
            </h1>
            <p className="text-[13px] text-mute">{lastUpdated}</p>
          </section>
        </FadeUp>

        {/* Intro */}
        <FadeUp delay={0.04}>
          <div className="max-w-[720px] mx-auto px-4 pb-8">
            <p className="text-base md:text-[17px] text-ink-soft leading-relaxed">{intro}</p>
          </div>
        </FadeUp>

        {/* Table of contents */}
        <FadeUp delay={0.08}>
          <nav className="max-w-[720px] mx-auto px-4 pb-10" aria-label={tocTitle}>
            <div className="border border-rule rounded-[14px] p-5 md:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-4">
                {tocTitle}
              </p>
              <ol className="flex flex-col gap-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-[13px] text-ink-soft hover:text-ink transition-colors duration-[240ms] leading-snug"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </FadeUp>

        {/* Sections */}
        <div className="max-w-[720px] mx-auto px-4">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="pb-8 scroll-mt-8">
              <h2 className="text-[1rem] font-medium text-ink tracking-[-0.02em] mb-4">
                {s.title}
              </h2>
              <div className="flex flex-col gap-4">
                {s.body.split('\n\n').map((para, j) => (
                  <p key={j} className="text-[15px] text-ink-soft leading-[1.75]">
                    {para}
                  </p>
                ))}
              </div>
              {i < sections.length - 1 && (
                <div className="border-b border-rule mt-8" />
              )}
            </section>
          ))}
        </div>

        {/* Cross-link */}
        <div className="max-w-[720px] mx-auto px-4 pb-24 pt-6">
          <p className="text-[13px] text-mute">
            {crossLinkPrefix}{' '}
            <Link
              href={crossLinkHref}
              className="text-ink-soft underline underline-offset-2 hover:text-ink transition-colors duration-[240ms]"
            >
              {crossLinkLabel}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
