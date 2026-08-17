import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Bots that must get a BLOCKING render, so metadata lands inside <head>.
 *
 * THE PROBLEM THIS SOLVES
 *   Next 15.5 streams metadata by default: generateMetadata no longer blocks
 *   the shell, and the <title>, <link rel="canonical">, hreflang and og: tags
 *   are flushed AFTER </head>. Browsers and Googlebot cope — React hoists them
 *   into the head during hydration, and both execute JavaScript. A crawler that
 *   does NOT execute JavaScript sees them sitting in <body>, where a canonical
 *   link and og: tags are ignored by every consumer that reads them.
 *
 *   This is not new and not ours: a build of the untouched HEAD on the same
 *   Next version puts /en/contact's canonical after </head> exactly the same
 *   way. It became worth fixing when the canonical, hreflang and OG tags this
 *   work added made <head> placement load-bearing.
 *
 * WHY THIS LIST
 *   Next's default already covers the social scrapers and the non-JS search
 *   engines (Bing, Yandex, Baidu, DuckDuckGo, Applebot, Facebook, Twitter,
 *   LinkedIn, Slack, WhatsApp, Discord) — the first line below is copied
 *   verbatim from next/dist/shared/lib/router/utils/html-bots.js, because
 *   setting this option REPLACES the default rather than extending it.
 *
 *   The second line is the addition: the AI answer engines. None of them run
 *   JavaScript, and they are the entire point of Law 3's GEO/AEO mandate — a
 *   site trying to be cited by ChatGPT, Perplexity and Claude cannot afford to
 *   serve them a page whose canonical and social metadata are unreachable.
 *
 *   The third line is the chat apps the default misses. Verified by request,
 *   not assumed: Facebook, WhatsApp, Twitter, Telegram (its UA carries
 *   "TwitterBot") and Discord all already got <head> metadata; Snapchat got it
 *   in <body>, which means a listing shared into a Snap renders as a bare link.
 *   Unit pages now carry a generated share card, so these matter.
 *
 *   Instagram, LINE and Viber are deliberately NOT here even though they show
 *   link previews: their UA strings belong overwhelmingly to in-app BROWSERS
 *   carrying real users, which do execute JavaScript. Matching them would trade
 *   a blocking render for thousands of humans to fix a preview for a handful of
 *   fetches. "Snapchat" has the same ambiguity but was named as a target
 *   channel, and a broken card costs more there than the milliseconds do.
 *
 * Googlebot is deliberately NOT here. Next classifies it as a JS-executing bot
 * and streams to it on purpose; forcing a blocking render would slow the crawl
 * we most want to be fast, for no gain.
 *
 * ⚠️ ON A NEXT UPGRADE: re-check the first line against html-bots.js upstream.
 * A default that grows there will not reach us while this override is set.
 */
const HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|GPTBot|OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|Amazonbot|Bytespider|CCBot|cohere-ai|Diffbot|meta-externalagent|Applebot-Extended|Snapchat|Pinterest|Iframely|Embedly/i;

const nextConfig: NextConfig = {
  // Resolve the workspace-root warning from the parent-dir package-lock.json
  outputFileTracingRoot: path.join(__dirname),
  htmlLimitedBots: HTML_LIMITED_BOTS,
  // The confirmation email renders the legal PDFs with embedded Geist. Vercel's
  // tracer cannot see fonts loaded by a runtime path.join, so name them
  // explicitly or they are absent in the deployed function and the render fails.
  outputFileTracingIncludes: {
    '/api/payment/callback': ['./src/lib/pdf/fonts/*.ttf'],
    // Same reason, same fonts: the default social card renders the wordmark in
    // Geist via ImageResponse, reading the TTFs with a runtime path.join that
    // the tracer cannot follow. Without this the deployed route throws and every
    // og:image on the brand pages 500s.
    '/opengraph-image/route': ['./src/lib/pdf/fonts/*.ttf'],
    // And again for the per-unit share card, which composites the title and
    // price onto the cover photo in the same typeface — plus the brand lockup
    // it stamps on top. Nothing under public/ is guaranteed to be readable from
    // a deployed function's filesystem unless it is traced in by name.
    '/opengraph-image/stays/[slug]/route': [
      './src/lib/pdf/fonts/*.ttf',
      './public/brand/mark.svg',
    ],
  },
  images: {
    // Route optimization through Supabase Storage's render/image endpoint
    // (see src/lib/image-loader.ts). Vercel's own /_next/image optimizer is
    // bypassed entirely — it was returning 402 (Hobby-plan quota exhausted).
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    // Capped at 1600. Next's default list runs to 3840, and every one of those
    // entries is a real width Supabase will render and a phone might pick: the
    // srcset on a listing page offered 2048w and 3840w although the LARGEST
    // image box the site has is the 740px CSS unit cover (≈1480px at DPR 2).
    // Nothing here should ever request more than that.
    deviceSizes: [640, 750, 828, 1080, 1200, 1600],
    // Same reasoning at the small end: these serve the 176px city rail and the
    // 270px gallery thumbnails. The 16–96px defaults exist for icons, which
    // this site renders as SVG.
    imageSizes: [128, 256, 384],
    // With a custom loader Next no longer uses its built-in optimizer, so
    // remotePatterns is not strictly enforced; kept as documentation of the
    // hosts we serve images from.
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Supabase Storage — unit-media + geo-media buckets
      { protocol: 'https', hostname: 'djtpksherrayzxmunvkv.supabase.co', pathname: '/storage/v1/**' },
      // The image CDN in front of that Storage host, when one is configured
      // (NEXT_PUBLIC_IMAGE_HOST). Documentation only, like the entries above:
      // the custom loader means Next never fetches these itself.
      ...(process.env.NEXT_PUBLIC_IMAGE_HOST
        ? [{
            protocol: 'https' as const,
            hostname: new URL(
              /^https?:\/\//.test(process.env.NEXT_PUBLIC_IMAGE_HOST)
                ? process.env.NEXT_PUBLIC_IMAGE_HOST
                : `https://${process.env.NEXT_PUBLIC_IMAGE_HOST}`,
            ).hostname,
            pathname: '/storage/v1/**',
          }]
        : []),
    ],
  },
};

export default withNextIntl(nextConfig);
