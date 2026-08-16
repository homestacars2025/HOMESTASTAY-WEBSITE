import { getMessages } from 'next-intl/server';
import { citySlug } from './city-slug';

/**
 * A city's name in the visitor's language.
 *
 * geo_cities.name is the Turkish/Latin name — "Antalya", "İzmit". Printing that
 * inside an Arabic sentence ("إقامات في Antalya") is a script collision on the
 * most prominent line of the page, and the messages files already carry proper
 * translations for the cities we promote.
 *
 * WHY IT READS THE MESSAGE OBJECT RATHER THAN CALLING t()
 *   Most cities have no translation key, and a missing key makes next-intl
 *   throw (or render the key path). This needs a lookup that can MISS quietly
 *   and fall back to the database name, which is the correct answer for every
 *   city we have not translated.
 *
 * The key is the derived slug, so `cities` in the message files is keyed the
 * same way the URLs are — one naming convention, not two.
 */
export async function localizedCityName(
  cityName: string,
  locale: string,
): Promise<string> {
  const messages = (await getMessages({ locale })) as Record<string, unknown>;
  const cities = messages.cities;

  if (cities && typeof cities === 'object') {
    const translated = (cities as Record<string, unknown>)[citySlug(cityName)];
    if (typeof translated === 'string' && translated.trim() !== '') {
      return translated;
    }
  }

  return cityName;
}
