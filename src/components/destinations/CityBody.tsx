import type { ReactNode } from 'react';

/**
 * Renders the Markdown in city_content.body.
 *
 * WHY NOT A MARKDOWN LIBRARY
 *   react-markdown + remark is ~40 KB of parser to render text that uses four
 *   constructs: h2, h3, paragraph, and bold. Law 1 says every dependency is a
 *   trade-off, and this one buys nothing the editorial copy uses.
 *
 * WHY NOT dangerouslySetInnerHTML
 *   The body is authored by an AI pipeline into a database column. Rendering
 *   that as raw HTML would make any future prompt injection into that pipeline
 *   a stored XSS on a public page. This emits React elements, so the content is
 *   text by construction — there is no HTML sink to escape into and nothing to
 *   sanitise.
 *
 * The heading levels are h2/h3 deliberately: the page's single h1 is
 * city_content.h1, and body headings hang beneath it. A body that opened at h1
 * would give the page two, which is the hierarchy defect Law 3 calls out.
 */

/** Splits `**bold**` runs out of a line. Everything else stays literal text. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-medium text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function CityBody({ markdown }: { markdown: string }) {
  // Blank line separates blocks — the only structural rule the copy relies on.
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="max-w-2xl">
      {blocks.map((block, i) => {
        const key = `b${i}`;

        if (block.startsWith('### ')) {
          return (
            <h3
              key={key}
              className="mt-8 mb-2 text-base font-medium tracking-[-0.015em] text-ink"
            >
              {inline(block.slice(4), key)}
            </h3>
          );
        }

        if (block.startsWith('## ')) {
          return (
            <h2
              key={key}
              className="mt-10 mb-3 text-[19px] font-medium tracking-[-0.025em] text-ink"
            >
              {inline(block.slice(3), key)}
            </h2>
          );
        }

        // A block whose every line is a bullet becomes one list. A block with a
        // stray bullet mid-paragraph is left as prose — guessing would mangle it.
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={key} className="mt-3 mb-3 space-y-1.5 list-disc list-inside">
              {lines.map((line, j) => (
                <li key={`${key}-${j}`} className="text-ink-soft leading-relaxed">
                  {inline(line.replace(/^[-*]\s+/, ''), `${key}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={key} className="mt-3 text-ink-soft leading-relaxed">
            {/* A single newline inside a paragraph is a soft wrap in Markdown,
                not a break — collapse it so justified prose stays justified. */}
            {inline(block.replace(/\s*\n\s*/g, ' '), key)}
          </p>
        );
      })}
    </div>
  );
}
