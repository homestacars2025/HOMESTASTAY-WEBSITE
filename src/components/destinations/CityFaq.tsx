import type { CityFaqItem } from '@/lib/queries/destinations';

/**
 * The city FAQ, rendered as visible text.
 *
 * DELIBERATELY NOT AN ACCORDION. Law 3 wants these answers lifted into
 * featured snippets, "People also ask", and AI answers. An accordion would
 * still put the text in the DOM, but it hides it behind an interaction, and the
 * text-extraction pass most answer engines run favours what is actually
 * rendered. There are four short Q&As — the page can afford to just show them.
 *
 * h2 for the section, h3 per question: one level under the page h1, matching
 * the body headings, so the outline stays a single clean tree.
 *
 * Phase 4 attaches FAQPage JSON-LD to this same data. The visible text and the
 * structured data must come from one source — Google treats markup that has no
 * on-page counterpart as a violation, not a bonus.
 */
export function CityFaq({ items, heading }: { items: CityFaqItem[]; heading: string }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-14 max-w-2xl">
      <h2 className="mb-6 text-[19px] font-medium tracking-[-0.025em] text-ink">
        {heading}
      </h2>

      <dl className="space-y-6">
        {items.map((item, i) => (
          <div key={i} className="border-t border-rule pt-5 first:border-t-0 first:pt-0">
            {/* dt/dd carries the question-answer relationship for assistive tech;
                the h3 inside dt keeps the document outline intact. */}
            <dt>
              <h3 className="text-base font-medium tracking-[-0.015em] text-ink">
                {item.q}
              </h3>
            </dt>
            <dd className="mt-2 text-ink-soft leading-relaxed">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
