/**
 * Renders a JSON-LD graph into the document.
 *
 * WHY dangerouslySetInnerHTML IS CORRECT AND SAFE HERE
 *   A <script> element's contents are raw text, not markup — React cannot
 *   populate it as children, and there is no other API for it. The safety comes
 *   from the input, not the sink: `data` is always a JS object built in our own
 *   code, serialised by JSON.stringify. It is never a caller-supplied HTML
 *   string.
 *
 *   The one real hazard is a `</script>` sequence appearing inside a database
 *   string (a unit description, an FAQ answer), which would close the element
 *   early and turn the rest of the JSON into live markup — a stored XSS. `<` is
 *   escaped to its < form below, which JSON parsers read identically and
 *   the HTML tokeniser cannot see as a tag. Ampersand and the line/paragraph
 *   separators are escaped for the same class of reason.
 *
 * Rendered by Server Components, so the markup is in the HTML that arrives —
 * which is the entire point. A crawler that does not run JavaScript still sees
 * it.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return (
    <script
      type="application/ld+json"
      // reason: see the block comment — a <script> body has no React children API,
      // and the payload is our own object, escaped against early tag closure.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
