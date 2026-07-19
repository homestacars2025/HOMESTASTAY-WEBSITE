import { createTranslator } from 'next-intl';
import trMessages from '../../../messages/tr.json';

/**
 * Turkish translator for the owner decision pages.
 *
 * These routes sit outside src/app/[locale], so there is no NextIntlClientProvider
 * and no request locale to resolve — getTranslations() has nothing to read from.
 * createTranslator takes the messages directly, which is both correct here and
 * honest about the fact that this surface has exactly one language by design.
 *
 * Copy still lives in messages/tr.json rather than inline in components, so
 * these strings are edited in the same place as every other Turkish string.
 */
export function ownerT() {
  return createTranslator({
    locale: 'tr',
    messages: trMessages,
    namespace: 'ownerDecision',
  });
}
