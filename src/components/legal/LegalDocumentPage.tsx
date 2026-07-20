import { Info } from 'lucide-react';
import { Header } from '@/components/home/Header';
import type { LegalDocContent } from '@/lib/booking/documents';

/**
 * Renderer for the two Turkish distance-selling documents.
 *
 * Distinct from LegalPage (terms/privacy) because these carry two things
 * those do not: a document VERSION, which is what an acceptance record points
 * at, and — on the Ön Bilgilendirme Formu — the booking summary, which is
 * legally an annex to the form rather than decoration.
 */

interface LegalDocumentPageProps {
  content: LegalDocContent;
  /** e.g. '2026-07-20-draft' — must match the acceptance record. */
  version: string;
  versionLabel: string;
  /** Shown when the guest's locale has no translation yet. */
  fallbackNotice?: string;
  /** Booking summary annex. Rendered only on the Ön Bilgilendirme Formu. */
  annex?: React.ReactNode;
}

export function LegalDocumentPage({
  content,
  version,
  versionLabel,
  fallbackNotice,
  annex,
}: LegalDocumentPageProps) {
  return (
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="max-w-[720px] mx-auto px-4 pt-16 pb-24">
        <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-medium tracking-[-0.04em] leading-[0.95] text-ink mb-6">
          {content.heading}
        </h1>

        {/* Never a silent language substitution — if the guest is reading a
            language they did not ask for, say so before the legal text. */}
        {fallbackNotice && (
          <div className="flex items-start gap-3 border border-rule rounded-[14px] bg-paper-warm px-4 py-3 mb-6">
            <Info className="w-4 h-4 mt-[2px] shrink-0 text-ink-soft" aria-hidden />
            <p className="text-[13px] text-ink-soft leading-relaxed">{fallbackNotice}</p>
          </div>
        )}

        <p className="text-[15px] md:text-base text-ink-soft leading-relaxed mb-10">
          {content.intro}
        </p>

        {/* Table of contents */}
        <nav aria-label={content.tocTitle} className="mb-10">
          <div className="border border-rule rounded-[14px] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-4">
              {content.tocTitle}
            </p>
            <ol className="flex flex-col gap-2">
              {content.sections.map((s) => (
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

        {content.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="pb-8 scroll-mt-8">
            <h2 className="text-[1rem] font-medium text-ink tracking-[-0.02em] mb-4">
              {s.title}
            </h2>
            <div className="flex flex-col gap-4">
              {s.body.split('\n\n').map((para, j) => (
                <p key={j} className="text-[15px] text-ink-soft leading-[1.75] whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
            {i < content.sections.length - 1 && (
              <div className="border-b border-rule mt-8" />
            )}
          </section>
        ))}

        {annex && (
          <section id="annex" className="pt-4 scroll-mt-8">
            <div className="border-t border-rule pt-8">
              <h2 className="text-[1rem] font-medium text-ink tracking-[-0.02em] mb-4">
                {content.annexTitle}
              </h2>
              {annex}
            </div>
          </section>
        )}

        {/* The version an acceptance record points at. Visible on purpose. */}
        <p className="mt-12 pt-6 border-t border-rule font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
          {versionLabel}: {version}
        </p>
      </main>
    </div>
  );
}
