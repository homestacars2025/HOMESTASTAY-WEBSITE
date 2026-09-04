import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { ApplicationForm } from '@/components/careers/ApplicationForm';
import { fetchOpening } from '@/lib/careers/fetch-opening';

/**
 * Apply to one opening.
 *
 * ⚠️ UNLISTED, NOT SECRET. There is no careers index: an opening is published,
 * its link is taken, and the link is sent to candidates. But public_slug is a
 * short readable string, not a credential — anyone who guesses one can apply.
 * That is fine for a job ad and must not be mistaken for access control; the
 * Edge Function refusing anything unpublished is the actual boundary.
 *
 * ⚠️ noindex AND no-referrer, TOGETHER. noindex keeps it out of search;
 * no-referrer keeps the URL out of the Referer header of anything the page
 * links to. Same posture as /book/[slug] and /booking/[reference] — a private
 * URL that leaks in a header is not private.
 *
 * NO JSON-LD, no hreflang, no sitemap entry, by decision: this page is not
 * meant to be discovered. Law 3's duty runs the other way here.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function ApplyPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'careers' });

  const result = await fetchOpening(slug);

  // A closed opening and a slug that never existed are the same page on
  // purpose: neither should let anyone map which roles we have run.
  if (result.status === 'not_found') notFound();

  if (result.status === 'unavailable') {
    return (
      <Shell>
        <Notice title={t('unavailableTitle')} body={t('unavailableBody')} />
      </Shell>
    );
  }

  const { opening } = result;

  // The schema carries a required question this UI cannot draw. Showing the
  // rest would produce a form that CANNOT be accepted — the applicant fills
  // everything, submits, and the server answers 400 about a question they were
  // never shown. Refusing up front is the honest failure.
  if (result.status === 'unusable_form') {
    return (
      <Shell>
        <Heading opening={opening} departmentLabel={t('department')} />
        <Notice title={t('formUnavailableTitle')} body={t('formUnavailableBody')} />
      </Shell>
    );
  }

  return (
    <Shell>
      <Heading opening={opening} departmentLabel={t('department')} />

      {opening.description && (
        // Plain text, rendered as text. The description is authored in the
        // recruitment console and never reaches dangerouslySetInnerHTML —
        // whitespace-pre-line is what keeps its paragraphs without parsing it.
        <div className="mt-8 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft md:text-base">
          {opening.description}
        </div>
      )}

      <div className="mt-12 border-t border-rule pt-10">
        <h2 className="mb-8 text-[clamp(1.15rem,3vw,1.5rem)] font-medium tracking-[-0.03em] text-ink">
          {t('applyTitle')}
        </h2>

        <ApplicationForm
          slug={opening.public_slug}
          title={opening.title}
          fields={result.fields}
        />
      </div>
    </Shell>
  );
}

// ── Layout pieces ─────────────────────────────────────────────────────────────
// Server components, all of them: nothing here is interactive, so nothing here
// ships to the browser.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-2xl px-4 pt-12 pb-24 md:pt-16">{children}</main>
    </div>
  );
}

function Heading({
  opening, departmentLabel,
}: {
  opening: { title: string; department: string | null; platform: string | null };
  departmentLabel: string;
}) {
  return (
    <header>
      {(opening.department || opening.platform) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {opening.department && (
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-mute">
              {departmentLabel} · {opening.department}
            </span>
          )}
          {opening.platform && (
            <span className="rounded-[999px] border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              {opening.platform}
            </span>
          )}
        </div>
      )}

      {/* The one <h1> on the page. */}
      <h1 className="text-[clamp(1.75rem,6vw,3rem)] font-medium leading-[1.02] tracking-[-0.045em] text-ink">
        {opening.title}
      </h1>
    </header>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="status"
      className="mt-10 flex flex-col items-center gap-3 rounded-[14px] border border-rule px-6 py-14 text-center"
    >
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-mute">{body}</p>
    </div>
  );
}
