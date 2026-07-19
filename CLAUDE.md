# Homesta Stay — CLAUDE.md
## Project Constitution (stable principles; changes rarely)

---

## 1. Project Identity

**Homesta** is the parent umbrella brand. It has two sub-brands sharing one identity system
(same mark, wordmark, typography, motion — only the accent color changes):

| Sub-brand | Status | Accent |
|-----------|--------|--------|
| **Homesta Cars** | Live, 40+ cars in Istanbul | Blue `#6EA4E7` |
| **Homesta Stay** | THIS PROJECT | Red `#E52851` |

**What Homesta Stay is:**
A full booking platform — think Airbnb / Booking.com — for short-term and touristic rentals
in Istanbul, Turkey. Guests browse listings, create accounts, make real bookings, and manage
their stays. We are a brokerage connecting property owners with guests. We are not a
full property-management company.

**Inventory:** apartments, cabins, villas, hotels, farms — across all budgets and style levels.

**Our edge vs Airbnb:** louder reach (team + bots), unique inventory, fast human response,
real-company trust.

**Legal company name:** [COMPANY_NAME — TBD, confirm before using in footer/legal copy]

**Domain:** homestastay.com

---

## 2. The Top Laws

These override all other decisions. No code may violate them.

### Law 1 — SPEED
The site must be blazing fast. Target: excellent Core Web Vitals (LCP < 2.5s, INP < 200ms,
CLS < 0.1).

- **Server Components by default.** Use Client Components only when interactivity demands it.
- **Minimal bundle.** No heavy libraries unless justified. Every dependency is a tradeoff.
- **Images:** always `next/image` with explicit dimensions, modern formats (avif/webp), lazy-load
  off-screen images, eager-load above-the-fold hero images.
- **Fonts:** Geist and Geist Mono loaded via `next/font`. Never use a CDN `<link>` for fonts in
  production — it adds a blocking network round-trip.
- **No layout shift.** Reserve space for images, fonts, and async content before it loads.
- Every architecture decision favors speed first.

### Law 2 — DESIGN
Clean, airy, contemporary, smooth. Never cluttered.

- Generous whitespace. One primary action per screen section.
- The interface is "quiet, generous, photographic." Let imagery carry emotional weight.
- Motion is **240ms** — stated verbatim in the brand file as "slow exhale." Nothing snappy,
  bouncy, or abrupt.
- Corner radius: **14px** standard (stated verbatim: "soft, not playful"), **999px** for pill
  CTAs and filter chips (consistent throughout brand file). Card-level radius — *to verify
  against brand identity*; the brand file applies 12–18px depending on context, with no single
  stated rule for cards.
- Every added element must earn its place. When in doubt, remove it.

### Law 3 — DISCOVERABILITY: SEO / GEO / AEO

The mission of this website is to **reach as many people as possible through organic discovery**.
Every page, every component, every decision must be evaluated for its impact on:

- **SEO** (Search Engine Optimization) — ranking on Google, Bing, Yandex (important for RU audience), Yahoo, etc.
- **GEO** (Generative Engine Optimization) — being cited and surfaced by AI answer engines: ChatGPT, Perplexity, Claude, Gemini, Copilot, etc.
- **AEO** (Answer Engine Optimization) — appearing in featured snippets, "People also ask", direct-answer boxes, voice assistants, and conversational answers.

#### Technical SEO foundations

- Server-rendered HTML for all public content (no client-only rendering for indexable text).
- Proper `<title>` and `<meta description>` per page, per locale — unique, descriptive, keyword-aware, NOT generic. Use Next.js Metadata API.
- Canonical URLs per page.
- `hreflang` tags for all 4 locales (en/ar/tr/ru) on every public page, with `x-default`.
- Open Graph + Twitter cards for rich social previews (title, description, image).
- `robots.txt` and `sitemap.xml` — sitemap auto-generated from real pages + dynamic routes (cities, units, blog posts). Multi-locale sitemap with alternates.
- Clean, human-readable, localized URL slugs (e.g. `/stays/istanbul/bosphorus-view-studio` — not `/stays/uuid-12345`).
- Fast Core Web Vitals — already covered by Law #1 Speed.
- Proper semantic HTML: `<h1>` only once per page, real heading hierarchy, semantic landmarks.
- Image `alt` text on every meaningful image, localized.
- Internal linking strategy: every page links to related pages (cities ↔ units ↔ blog).

#### Structured data (Schema.org JSON-LD) on every relevant page

- **Homepage:** `Organization` + `WebSite` (with `SearchAction`).
- **Unit detail pages:** `LodgingBusiness` or `Accommodation` — address, geo, amenities, `aggregateRating`, `priceRange`, images.
- **City landing pages:** `Place` + `ItemList` of units.
- **Blog posts:** `Article` with author, `datePublished`, image, headline.
- **Breadcrumbs:** `BreadcrumbList` on every nested page.
- **FAQ sections:** `FAQPage`.
- **"How it works":** `HowTo` schema.

#### GEO / AEO — content for AI answer engines

- Write content in a way LLMs can cite: clear, factual, well-structured prose with explicit answers near the top of the page.
- FAQ sections on key pages (cities, "Become a host", booking process) — these get pulled directly into AI answers.
- `llms.txt` at the site root, listing key pages and what they answer, to help LLM crawlers understand the site.
- Each city page should include a short "About [City]" factual paragraph that directly answers common queries.
- Unit pages must include a clear factual summary block (location, capacity, key amenities) that LLMs can lift cleanly.

#### Content & locale strategy

- Every public page must exist in all 4 locales with real translations (body content, not just UI chrome).
- Localized `<meta>` titles, descriptions, and OG per locale.
- Localized URL slugs where appropriate (Arabic/Russian may use transliterated or English slugs — decide per case to avoid encoding issues).
- Country/city pages designed to scale to Libya, UAE, etc. later — do not hardcode "Türkiye".

#### Process rule

Every new page or major component **must be evaluated for SEO/GEO/AEO before being considered done**:
checklist — `<title>`, `<meta description>`, OG tags, structured data, `hreflang`, internal links, `alt` text.

> **This law has the same weight as Speed (#1) and Design (#2). A feature that looks great and
> is fast but is invisible to Google and AI engines has FAILED the project mission.**

### Law 4 — COLOR HIERARCHY
Follow strictly. This is what differentiates us from Airbnb.

| Priority | Color | Hex | Use |
|----------|-------|-----|-----|
| 1st | Stay Red | `#E52851` | CTAs, prices, ratings, active states, confirmations |
| 2nd | Black | `#0E0E10` | Secondary CTAs, wordmark, heavy type, dark surfaces |
| 3rd | Pure White | `#FFFFFF` | **Primary site background** (`--paper`), modals, cards |
| 4th | Paper-warm | `#F2EEE6` | Filter chips, hover states, subtle section contrast |

> **Brand update:** `--paper` is now `#FFFFFF` (pure white) — intentionally set to create a
> crisp, bright feel. The original warm `#FAFAF7` has been retired as the main background.
> `--paper-warm` (`#F2EEE6`) remains as the token for chips, hover states, and anywhere a
> warm contrast against the white background is needed.

The black presence is **intentional** — it gives a premium, modern feel and sets us apart
from Airbnb's palette. Do not shy away from it.

The red is used **sparingly** — only where it earns a moment (a price, a CTA, a confirmation).
Never use it for decoration or hover states that don't warrant it.

### Law 5 — MOBILE-FIRST
Our guests book from their phones.

- Design for 375px first. Enhance for larger screens.
- Touch targets ≥ 44px.
- Bottom-anchored primary CTAs on mobile.
- Test every layout on mobile before calling it done.

---

## 3. Business Model

Three tiers, encoded as `business_model_enum` in the database:

| Enum Value | Status | Description |
|------------|--------|-------------|
| `brokerage` | **ACTIVE — current focus** | Bridge: we connect owners and guests. Fast response, real-company trust. |
| `profile_management` | Planned | We list everywhere and handle bookings exclusively; check-in/out and cleaning stay with owner. |
| `full_management` | Not active | We manage everything. Launches only when we have cleaning/maintenance staff. |

**Style levels (in DB):** `practical`, `standard`, `luxury`, `super_luxury`.

When building any listing-related UI, do not assume all properties behave the same way.
A unit's `business_model` field determines what features and workflows apply to it.
Consult `DATABASE_SCHEMA.md` for the exact column name and enum values.

---

## 4. The Booking Platform

This is a **full booking platform**, not a catalog with a contact form.

### Guest capabilities (to be built gradually, session by session):
- Browse and search listings with filters
- View unit detail pages (gallery, amenities, availability, pricing)
- Create an account and sign in (Supabase Auth)
- Make a real booking: select dates, confirm, receive a booking record
- View and manage their own bookings ("My bookings")

### What does NOT live in this codebase:
- **No WhatsApp or owner-approval logic.** That is a separate internal system. This website
  does not call it, reference it, or know it exists.
- **No admin or host dashboard.** Owner-facing surfaces are a separate project.
- **No CRM, finance, or team tooling.**

---

## 5. Tech Stack

| Layer | Choice | Constraint |
|-------|--------|------------|
| Framework | Next.js 15 (App Router) | Server Components first |
| UI | React 19 | No legacy patterns (`forwardRef`, class components) |
| Language | TypeScript (strict) | No `any` without a `// reason:` comment |
| Styling | Tailwind CSS v4 | Custom design tokens as CSS custom properties |
| Components | shadcn/ui | Radix primitives; copy-in model (components live in `/components/ui`) |
| i18n | next-intl | All strings in message files; no hardcoded UI strings |
| Database / Auth | Supabase | Separate Stay project; see §8 |
| Hosting | Vercel | Edge-compatible; no Node.js-only APIs in Edge routes |
| Fonts | Geist + Geist Mono | Loaded via `next/font`; never a CDN link |

Do not introduce new significant dependencies without justification. Every added package
is a bundle-size cost and a security surface.

---

## 6. Internationalization (i18n)

**Four supported languages:**

| Code | Language | Direction |
|------|----------|-----------|
| `en` | English | LTR — **default / fallback** |
| `ar` | Arabic | **RTL** |
| `tr` | Turkish | LTR |
| `ru` | Russian | LTR |

**Rules:**

- Auto-detect from browser `Accept-Language` header. Fall back to `en`.
- **All UI strings** live in next-intl message files (`/messages/[locale].json`).
  Zero hardcoded strings in components or layouts.
- **RTL (Arabic) is a launch-day requirement — build for it from the start.** Use CSS logical
  properties everywhere (`margin-inline-start`, `padding-inline-end`, `border-inline-start`,
  etc.). Never use `margin-left/right` directly — they break Arabic layout.
- The full layout (flex/grid direction, icon mirroring, text alignment) must flip for `ar`.
- Test every layout in Arabic before marking a feature done.
- Dates: use `Intl.DateTimeFormat` with the active locale. No hardcoded date formats.
- Currency symbol position also follows locale conventions.
- Number formatting: use `Intl.NumberFormat`. No manual formatting.

---

## 7. Brand Identity (applied to code)

### Design tokens — define as CSS custom properties in global CSS

```css
/* Accent */
--stay:          #E52851;   /* 1st — CTAs, prices, ratings, confirmations */
--stay-ink:      #8C0E2A;   /* dark red — sub-brand label only */

/* Ink (black family) — 2nd in hierarchy */
--ink:           #0E0E10;   /* primary text, dark surfaces */
--ink-2:         #1B1B1F;
--ink-soft:      #45454B;   /* body text */

/* White — 3rd in hierarchy */
--white:         #FFFFFF;   /* pure white — clean surfaces, modals, cards on dark bg */

/* Paper (background) — intentionally set to pure white (brand decision, overrides original warm-paper) */
--paper:         #FFFFFF;   /* primary background — pure white */
--paper-warm:    #F2EEE6;   /* chips, hover states, subtle section contrast */
--paper-cool:    #F0F2F5;

/* Structure */
--rule:          #E2DED4;   /* dividers, borders */
--mute:          #8C8881;   /* captions, labels, quiet text */

/* Dark mode hairlines */
--hairline-dark: #25252A;
```

### Typography

**Geist** (sans-serif) — all prose, headings, the wordmark.
- Wordmark: weight 500, `letter-spacing: -0.045em`, `font-feature-settings: "ss01","cv11","cv06"`.
- Display headings: weight 500, tracking -0.035em to -0.045em, line-height 0.9.
- Body: weight 400, tracking -0.01em, line-height 1.35, color `--ink-soft`.
- Desktop body size: 20–22px. Mobile: 16–18px.

**Geist Mono** — tags, filter chips, breadcrumbs, codes, captions, eyebrow labels.
- Always uppercase with 0.06–0.12em letter-spacing.
- Color `--mute` by default.

### Component conventions

- **Wordmark** always lowercase: `homesta — stay`.
- **Accent use rule:** prices, ratings (★), CTA fills, active nav indicator, booking
  confirmations. **Not** for general hover states, icons, or decorative elements.
- **CTAs:** pill shape (`border-radius: 999px`), accent fill, white text.
  Secondary CTAs: black fill or outlined.
- **Cards:** `border: 1px solid var(--rule)`. Exact corner radius — *to verify against brand
  identity*; brand file uses 12–18px in different contexts with no single stated card rule.
- **Dark mode:** `--ink` background, `--paper` text, `--hairline-dark` borders.
  In dark mode the accent carries the brand mark — "never glowing, never neon."
- **Photography tone:** natural light, soft shadow, real spaces. No sterile stock photos.

---

## 8. Database Access Rules

**The Stay website connects to its own dedicated Supabase project** — separate from
Homesta Cars. Never cross-reference Cars tables.

### Environment variables (never hardcode)

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Safe for browser
SUPABASE_SERVICE_ROLE_KEY         # Server-only; never import in Client Components
```

### Schema — the live database is the single source of truth

The schema evolves over time. The only authoritative source is the **live Supabase database**,
queryable via the Supabase MCP tool once connected.

**Before writing any query involving a table, column, enum, or relationship:**
1. Verify it exists in the live DB via MCP.
2. Do not trust memory, guesses, or `DATABASE_SCHEMA.md` alone.

`DATABASE_SCHEMA.md` is a **convenience snapshot only** — it may be stale. Use it as a
quick orientation, then confirm against the live DB. When the user asks, regenerate it from
the live DB in one pass.

### Allowed reads (public / guest-facing)

- `units` and all satellite tables (images, amenities, availability, geo, etc.)
- Geographic / location lookup tables
- Public reference tables (unit types, style levels, amenities, etc.)
- A guest's own profile and bookings (via RLS: `auth.uid() = guest_id`)

### Allowed writes (public / guest-facing)

- Guest account data via Supabase Auth (`auth.users`, `profiles`)
- Bookings — when a guest completes a booking flow
- Any guest-facing table confirmed to exist in the live DB

### Forbidden — never touch from this codebase

- CRM tables
- Finance / payment settlement tables
- Owner / team internal tables
- Any table whose purpose is not clearly guest-facing

**Rule:** when in doubt, do not touch it. Ask first.

### RLS is always on

Never disable Row Level Security for convenience. Write correct policies.
Any route accessing user-specific data must verify the session **server-side**,
not only on the client.

---

## 9. Pricing Rules

### Pricing is derived, never cached

`units.cost_price` and `units.commission_percent` are live settings the business owner
changes at will. Every price shown to a guest is computed from them **at read time** via
`resolve_nightly_prices()` — cost (or the day's `unit_daily_prices` override) →
length-of-stay discount → current commission → customer price. No intermediate price is
ever stored or displayed from storage.

The single exception is `booking_nightly_prices`, written at booking time: that is a
contractual snapshot of what a specific guest agreed to pay, not a cache, and it is
immutable once paid.

Guest-facing code must call `quote_units()` (batched, for listing surfaces) or
`quote_nightly_prices()` (single unit, per-night). **Never call `resolve_nightly_prices()`
from a guest-facing path** — it returns the owner's cost price and is granted to
`service_role` only.

> `units.base_nightly_price` is **deprecated**. It was a cache of
> `cost_price × (1 + commission_percent)` and went stale the moment a commission changed.
> Nothing in this codebase reads it. It is removed once HP-ADMIN confirms it is unused.

### Currency

- **All prices are stored in USD** in the database. This is non-negotiable.
- **Never store a currency-converted value.** Conversion is display-time only.
- **Default display currency:** USD.
- **Supported display currencies:** USD (base), EUR, TRY, LYD. RUB to be added later.
  Fetch a live rate at display time, convert, show. Never persist the converted amount.
- When showing a non-USD price, always show the USD equivalent nearby
  (e.g. in a tooltip or fine print).
- Format with `Intl.NumberFormat` matching the active locale.

---

## 10. Safety & Guardrails

**Secrets and environment variables:**
- No hardcoded secrets anywhere in the codebase — ever.
- `NEXT_PUBLIC_*` variables are exposed to the browser. Treat them accordingly.
- Server-only env vars must never be imported in Client Components (`"use client"` files).

**Auth and data security:**
- All routes accessing user-specific data must verify the session server-side.
- Never expose owner contact details, financial data, or internal notes to the client.
- Validate all user-supplied input at the server boundary (Server Actions, Route Handlers).

**TypeScript:**
- `strict` mode always on.
- No `any` without an explicit `// reason:` inline comment explaining why it's unavoidable.
- No `@ts-ignore` or `@ts-expect-error` without a comment.

**React / Next.js:**
- No `dangerouslySetInnerHTML` without sanitization and a comment explaining why it's safe.
- No direct `document` / `window` access in Server Components.
- No `useEffect` for data fetching — use Server Components or React Query / SWR patterns.

**Dependency hygiene:**
- No new significant dependencies without justification in the PR description.
- Prefer native browser APIs and Next.js built-ins over third-party packages for common tasks.

---

## 11. Open Questions

These facts are not yet confirmed. Do not invent answers. When a task requires one of
these, surface the question rather than guessing.

| # | Question | Affects |
|---|----------|---------|
| 1 | Legal company name for footer and terms? | Footer, `/terms`, `/privacy` |
| 2 | Payment provider? (examples: Stripe, Iyzico — confirm actual choice) | Booking flow, §4 |
| 3 | Is there a separate staging Supabase project? | CI/CD, environment setup |
| 4 | Guest support contact (email for guests)? | Footer, help pages |
| 5 | Are there reviews / wishlist features in scope? | Guest dashboard scope |
| 6 | Is there a mobile app planned, or web-only? | Architecture decisions |
