/** Client-safe: the search bar filters its list with the same rule the server matches with. */

/**
 * One comparable form for every spelling: case-folded (Turkish dotted and
 * dotless i included), Latin accents stripped, Arabic diacritics/tatweel
 * removed and its letter variants unified, punctuation collapsed to spaces.
 * İstanbul, ISTANBUL and istanbul meet; so do أكسراي and اكسراي.
 */
export function normalizePlace(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
