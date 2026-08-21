import { ImageResponse } from 'next/og';
import { unstable_cache } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type Locale } from '@/i18n/routing';
import { getPublicUnitBySlug } from '@/lib/queries/stays';
import { geistFont, brandMarkAccent, markBoxForArch, markInset } from '@/lib/seo/og-fonts';
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, ogImage } from '@/lib/config/seo';
import { cardPlace, formatCardPrice, unitTypeLabelFor } from '@/lib/seo/social-card';
import { withStorageHost } from '@/lib/image-loader';

/**
 * The share card for one unit: its cover photograph with the title, place and
 * nightly rate composited onto it.
 *
 * WHY GENERATE IT INSTEAD OF POINTING og:image AT THE PHOTO
 *   The bare photo makes a handsome card in Facebook and Twitter, which print
 *   og:title and og:description beside it. WhatsApp — the channel most of this
 *   audience actually shares in — renders the thumbnail small and the text
 *   smaller, and Snapchat/Instagram link stickers show the image alone. Burning
 *   the three deciding facts into the pixels means the card still says what the
 *   place is and what it costs wherever it lands.
 *
 * THE PATH IS LOAD-BEARING, twice over:
 *   - /opengraph-image* is excluded from the next-intl matcher by name (see
 *     src/middleware.ts). Under any other prefix this would 307 to /en/… and
 *     every crawler would follow a redirect to fetch a picture, which several
 *     of them refuse to do.
 *   - next.config.ts traces the Geist TTFs into this route explicitly; the
 *     runtime path.join in geistFont() is invisible to Vercel's tracer.
 *
 * ARABIC FALLS BACK TO LATIN COPY — see latinSafe() and captionFor() below.
 */

export const runtime = 'nodejs';

// No route-segment `revalidate`: the handler reads ?locale, so Next treats it
// as dynamic and the segment cache never applies. Caching lives in the two
// places that do work here — renderCard's Data Cache entry below, and the
// cache-control header the response carries.

const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };

// The arch spans BOTH lines of the stacked wordmark beside it, which is the
// proportion the site's own lockup uses: there the mark is 170 of 250 viewBox
// units against a ~94-unit "homesta", so it is not sized against one line.
const MARK_BOX = markBoxForArch(54);

/**
 * "homesta" over "stay", in px.
 *
 * Stacking is what lets the ratio drop this far. Set side by side, "stay" at
 * half the size read as a footnote and vanished at thumbnail scale; given a
 * line of its own it holds at 0.55, near the 0.42 the site's own lockup
 * (public/brand/stay-lockup-compact.svg) uses when it stacks the same two
 * words. The second line is flush RIGHT, so the two words end together.
 */
const HOMESTA_PX = 40;
const STAY_PX = 22;

// Brand tokens, inlined: satori resolves no stylesheet, so Tailwind's custom
// properties do not exist inside this tree.
const INK = '#0E0E10';
const STAY = '#E52851';
const PAPER = '#FFFFFF';

/**
 * Geist covers Latin and Cyrillic but has no Arabic glyphs — verified against
 * the vendored TTF, not assumed. Satori draws an uncovered codepoint as tofu
 * and performs no Arabic shaping, so Arabic composited here would come out as a
 * row of boxes or as disconnected letters: worse than no text at all.
 *
 * So the caption is built in the guest's locale when that renders, and retried
 * in English when it does not (captionFor below). The Arabic title still
 * reaches the guest — through og:title and og:description, which every platform
 * renders with a system font that shapes Arabic correctly.
 */
function latinSafe(text: string): boolean {
  // U+0600–U+06FF Arabic, U+0750–U+077F Arabic Supplement, U+FB50–U+FDFF and
  // U+FE70–U+FEFF presentation forms, plus CJK — anything Geist cannot draw.
  return !/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿一-鿿぀-ヿ]/.test(text);
}

/** Clip on a word boundary so a long ad_title does not overflow the card. */
function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The cover photo as raw bytes, for embedding as a data URI.
 *
 * Fetched here rather than handed to satori as a remote <img src> so that a
 * slow or missing photo degrades to a card without one instead of hanging the
 * crawler's request until it times out and shows no card at all.
 */
async function coverBytes(url: string | undefined): Promise<string | null> {
  if (!url) return null;

  const attempt = async (target: string): Promise<string | null> => {
    try {
      const res = await fetch(target, {
        signal: AbortSignal.timeout(4000),
        next: { revalidate: 3600 },
      });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get('content-type') ?? 'image/jpeg';
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  };

  const viaCdn = await attempt(url);
  if (viaCdn) return viaCdn;

  // A CDN that is misconfigured, cold or rate-limited must cost a slower card,
  // not a card with no photograph. withStorageHost is a no-op when no CDN is
  // configured, so this is a single request in that case.
  const origin = withStorageHost(url);
  return origin === url ? null : attempt(origin);
}

type Caption = {
  title: string;
  place: string | null;
  typeLabel: string;
  perNight: string;
};

/**
 * The composited copy in one locale, or null when Geist cannot draw it.
 *
 * Every string is checked together, including the "/ night" suffix: an Arabic
 * UI over a Turkish ad_title would otherwise pass the title check and then draw
 * tofu inside the price pill.
 */
async function captionFor(slug: string, locale: Locale): Promise<Caption | null> {
  const [unit, t] = await Promise.all([
    getPublicUnitBySlug(slug, locale),
    getTranslations({ locale, namespace: 'unit' }),
  ]);
  if (!unit) return null;

  const caption: Caption = {
    title: clamp(unit.ad_title ?? unit.unit_name ?? '', 68),
    place: cardPlace(unit.region ?? unit.municipality, unit.city),
    typeLabel: unitTypeLabelFor(t, unit.unit_type),
    perNight: t('perNight'),
  };
  if (!caption.title) return null;

  const all = [caption.title, caption.place ?? '', caption.typeLabel, caption.perNight].join(' ');
  return latinSafe(all) ? caption : null;
}

/**
 * Everything the card draws, and nothing else — the cache key for one card.
 *
 * The point of naming the CONTENT rather than the slug is that a changed price,
 * a new cover photo or a retitled listing produces a different key on its own,
 * so a cached card can never be stale. There is nothing to invalidate.
 */
type CardSpec = {
  photoUrl: string | undefined;
  price: string | null;
  caption: Caption | null;
};

/**
 * The composited card, as base64 — cached in the Data Cache, keyed by CardSpec.
 *
 * WHY THIS EXISTS
 *   Compositing is the whole cost of this route: satori lays the card out and
 *   resvg rasterises a full-bleed 1200x630 photograph under it. Everything
 *   around it — the unit query, the translations, the cover fetch — is already
 *   cached and costs single-digit milliseconds. So the FIRST share of any link
 *   paid the full render while the crawler waited, and so did every share after
 *   the CDN entry aged out, in every region.
 *
 *   Caching the finished bytes turns that into one render per distinct card,
 *   ever, rather than one per cache miss. A miss at the edge now costs a Data
 *   Cache read instead of a rasterisation.
 *
 * WHY IT IS SAFE TO HOLD FOR A WEEK (§9 — a price is derived, never cached)
 *   The stored bytes are not a price cache: the price is an INPUT to the key.
 *   When the owner moves cost_price or commission, getPublicUnitBySlug resolves
 *   the new rate, the spec differs, and the lookup misses onto a fresh render.
 *   The old entry is unreachable, not stale. 'units' is carried as a tag anyway
 *   so /api/revalidate sweeps it when Supabase reports a unit edit.
 *
 * The 2 MB Data Cache entry limit is not close: a q82 JPEG of this card is
 * ~110 KB, ~150 KB once base64'd.
 */
const renderCard = unstable_cache(
  async (spec: CardSpec): Promise<{ body: string; contentType: string }> => {
    const { photoUrl, price, caption } = spec;

    const [photo, mark, regular, medium, semibold] = await Promise.all([
      coverBytes(photoUrl),
      brandMarkAccent(),
      geistFont('Regular'),
      geistFont('Medium'),
      geistFont('SemiBold'),
    ]);

    const image = new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            position: 'relative',
            background: INK,
            fontFamily: 'Geist',
          }}
        >
          {photo && (
            // satori renders its own <img>; next/image does not exist inside an
            // ImageResponse, so this is the only element available here.
            <img
              src={photo}
              alt=""
              width={OG_IMAGE_WIDTH}
              height={OG_IMAGE_HEIGHT}
              // satori supports the longhand offsets only — `inset: 0` is ignored.
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* Scrim, bottom only.
              The bottom half carries white type over whatever the photographer
              pointed at, and the worst case is not a dark room — it is a white
              kitchen or a noon balcony, where a light gradient leaves the title
              legible only on the darker half of the frame. So the bottom is taken
              close to opaque and the ramp starts higher.

              The TOP IS DELIBERATELY UNTOUCHED. The logo up there has nothing
              behind it — no plate, no ramp — and is held together entirely by the
              shadow on the glyphs themselves. The photograph's own corner is the
              background, which is the point. */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              backgroundImage: photo
                ? 'linear-gradient(180deg, rgba(14,14,16,0) 0%, rgba(14,14,16,0) 32%, rgba(14,14,16,0.26) 46%, rgba(14,14,16,0.62) 62%, rgba(14,14,16,0.88) 80%, rgba(14,14,16,0.97) 100%)'
                : 'linear-gradient(180deg, rgba(14,14,16,1) 0%, rgba(14,14,16,1) 100%)',
            }}
          />

          {/* The lockup: mark + "homesta stay" on one line, exactly the way the
              site footer sets it — BrandMark beside a single line of Geist, both
              words the same size. The old stacked artwork tucked "stay" under
              "homesta" at a third of its size, which vanished in a chat
              thumbnail.

              NOTHING SITS BEHIND IT. The shadows are the whole mechanism: a
              text-shadow stack on the wordmark, and the matching filter baked
              into the mark's SVG (satori has no `filter`, so the mark has to
              carry its own — see brandMarkAccent). */}
          <div
            style={{
              position: 'absolute',
              top: 44,
              left: 52,
              display: 'flex',
              alignItems: 'center',
              gap: 18,
            }}
          >
            {/* next/image does not exist inside an ImageResponse; satori draws
                its own <img>.

                The arch is asked for at 56px, and markBoxForArch works out the
                box that yields it: most of the canvas is shadow margin. 56px of
                arch against the ~32px cap height of 44px Geist reproduces the
                ~1.76x ratio the footer sets the mark at. */}
            <img
              src={mark}
              alt=""
              width={MARK_BOX}
              height={MARK_BOX}
              // The negative margin cancels the canvas's shadow margin so the
              // element's layout box is the arch itself. Without it flex reserves
              // all 195px and the wordmark drifts ~70px away from the mark.
              style={{ margin: `${-markInset(MARK_BOX)}px` }}
            />

            <div
              style={{
                display: 'flex',
                // Stacked, and flush right: on a column the alignItems axis is
                // the CROSS axis, so flex-end lines the end of "stay" up with
                // the end of "homesta" instead of centring it under the word.
                flexDirection: 'column',
                alignItems: 'flex-end',
                fontWeight: 500,
                // The wordmark's own tracking, from the brand file.
                letterSpacing: '-0.045em',
                lineHeight: 1,
                // TWO layers, both faint, and the count is load-bearing twice.
                //
                // Visually: the original eight-layer stack stood five of its layers
                // at FULL opacity inside 12px of the glyphs, which stopped being a
                // shadow and became a black outline — it thickened the strokes,
                // filled the counters of the o/e/a and blunted the terminal of the
                // y. What is left is a tight pass for local separation and one wide
                // pass to sit the word on the photograph, neither dark enough to
                // touch a letterform.
                //
                // This is the floor, not a midpoint. Rendered on flat #FFFFFF — the
                // worst ground a cover photo offers, and the only reason a shadow
                // exists here at all — a lighter pair (3px/0.45 + 12px/0.35) left
                // white-on-white genuinely hard to read. Below this the shadow stops
                // doing the one job it has.
                //
                // For speed: satori rasterises every text-shadow layer as its own
                // blurred pass, and each measured ~0.4s of the render on this route.
                // The eight-layer stack WAS the slow share — 3.5s of a 3.8s
                // response. At two layers the composite is ~0.5s.
                textShadow: '0 0 4px rgba(14,14,16,0.55), 0 1px 14px rgba(14,14,16,0.4)',
              }}
            >
              <span style={{ color: PAPER, fontSize: HOMESTA_PX }}>homesta</span>
              <span style={{ color: STAY, fontSize: STAY_PX, marginTop: 6 }}>stay</span>
            </div>
          </div>

          {caption && (
            <div
              style={{
                position: 'absolute',
                left: 56,
                right: 56,
                bottom: 52,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {caption.place && (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 22,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.72)',
                    marginBottom: 14,
                  }}
                >
                  {caption.place}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  fontSize: caption.title.length > 40 ? 52 : 62,
                  fontWeight: 500,
                  letterSpacing: '-0.035em',
                  lineHeight: 1.05,
                  color: PAPER,
                }}
              >
                {caption.title}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  marginTop: 28,
                }}
              >
                {price && (
                  // The one red moment on the card (Law 4): the price is what the
                  // card is selling.
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      background: STAY,
                      color: PAPER,
                      borderRadius: 999,
                      padding: '14px 30px',
                      fontSize: 30,
                      fontWeight: 600,
                    }}
                  >
                    {price}
                    <span style={{ fontSize: 22, fontWeight: 400, paddingLeft: 8 }}>
                      {caption.perNight}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.82)' }}>
                  {caption.typeLabel}
                </div>
              </div>
            </div>
          )}

          {/* No caption in any locale (a unit with no Latin translation at all):
              the price still goes on, because digits and "$" always render. */}
          {!caption && price && (
            <div
              style={{
                position: 'absolute',
                left: 56,
                bottom: 52,
                display: 'flex',
                alignItems: 'baseline',
                background: STAY,
                color: PAPER,
                borderRadius: 999,
                padding: '14px 30px',
                fontSize: 32,
                fontWeight: 600,
              }}
            >
              {price}
            </div>
          )}
        </div>
      ),
      {
        ...size,
        fonts: [
          { name: 'Geist', data: regular, weight: 400, style: 'normal' },
          { name: 'Geist', data: medium, weight: 500, style: 'normal' },
          { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
        ],
      },
    );

    const png = Buffer.from(await image.arrayBuffer());
    const encoded = await toJpeg(png);

    // base64 rather than the Buffer: the Data Cache stores JSON, and a Buffer
    // round-trips through it as {type:'Buffer',data:[...]} — an array of 110k
    // numbers, which serialises to megabytes and reads back slower than the
    // render it was meant to save.
    return { body: encoded.body.toString('base64'), contentType: encoded.contentType };
  },
  ['og-card-stay'],
  { tags: ['units'], revalidate: 604800 },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const requested = new URL(request.url).searchParams.get('locale') ?? routing.defaultLocale;
  const locale: Locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as Locale)
    : routing.defaultLocale;

  // Same query, same 300s cache entry, and therefore the same nightly rate the
  // booking card on the page prints.
  const unit = await getPublicUnitBySlug(slug, locale);
  if (!unit) {
    return new Response('Not found', { status: 404 });
  }

  // English is the fallback for a locale Geist cannot draw (ar). It resolves
  // the unit's English translation — or the Turkish source behind it — which is
  // Latin either way, so an Arabic share still gets a captioned card.
  const caption =
    (await captionFor(slug, locale)) ??
    (locale === 'en' ? null : await captionFor(slug, 'en'));

  const cover = unit.media.find((m) => m.is_cover) ?? unit.media[0];

  const card = await renderCard({
    photoUrl: ogImage(cover?.public_url),
    price: formatCardPrice(unit.pricing.nightly_usd),
    caption,
  });

  // ImageResponse defaults to a one-year immutable cache, which would freeze a
  // stale price into every crawler's copy — hence an explicit header.
  //
  // THE LONG NUMBER IS THE ONE THAT MATTERS, and it is not s-maxage.
  //
  // The instinct is to make s-maxage enormous so the entry "never expires".
  // That is the wrong lever: an expired entry is not a slow one. Past the fresh
  // window stale-while-revalidate has the edge answer from its stored copy
  // immediately and refresh behind the request — measured at 227ms against
  // production, indistinguishable from a HIT — and that refresh is now a Data
  // Cache read rather than a composite. A long s-maxage would buy nothing and
  // cost the thing we actually care about: after the owner moves a price, the
  // edge would keep serving the old card for the whole window with no request
  // able to correct it.
  //
  // So: ten fresh minutes, then thirty days during which the card is always
  // served instantly and always one request away from being current. Nothing
  // in normal operation falls out of the cache.
  return new Response(new Uint8Array(Buffer.from(card.body, 'base64')), {
    status: 200,
    headers: {
      'content-type': card.contentType,
      'cache-control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=2592000',
    },
  });
}

/**
 * PNG in, JPEG out — the difference between a card WhatsApp shows and one it
 * silently drops.
 *
 * next/og can only emit PNG, and a PNG of a 1200x630 photograph is ~1.4 MB.
 * WhatsApp refuses to render a link preview whose og:image is over ~600 KB, and
 * WhatsApp is the channel this card exists for. The same picture as a q82 JPEG
 * is an order of magnitude smaller with no visible loss at card size.
 *
 * sharp is not imported at module scope, and a failure here is not fatal: if
 * the binary is missing for the deployed platform the route still returns the
 * PNG, which Facebook, Twitter and Telegram all accept. A large card beats no
 * card.
 */
async function toJpeg(png: Buffer): Promise<{ body: Buffer; contentType: string }> {
  try {
    const { default: sharp } = await import('sharp');
    const jpeg = await sharp(png)
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
    return { body: jpeg, contentType: 'image/jpeg' };
  } catch (error) {
    console.error('[og:stay] jpeg encode failed, serving png', error);
    return { body: png, contentType: 'image/png' };
  }
}
