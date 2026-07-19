-- ═══════════════════════════════════════════════════════════════════════════
-- Live pricing resolver — Homesta Stay (project djtpksherrayzxmunvkv)
--
-- Pricing is DERIVED, never cached. units.cost_price and units.commission_percent
-- are live settings the owner changes at will; any stored price is stale the
-- moment one of them moves. units.base_nightly_price is deprecated by this
-- migration (nothing here reads or writes it — it is removed in a later step,
-- once HP-ADMIN has confirmed it is unused).
--
-- Precedence, most specific first:
--   cost:     unit_pricing_overrides.override_price
--           → unit_daily_prices.host_price_usd
--           → units.cost_price
--   discount: (skipped entirely when override_price applied)
--           → unit_pricing_overrides.discount_percent
--           → unit_pricing_rules.discount_percent (matched on stay length)
--           → 0
--   then:     commission (per-unit) → tax carve-out
--
-- Tax is carved OUT of the commission, never added on top. At 0% the customer
-- price is identical to cost + commission; when a rate is set, only the split
-- between commission_usd and commission_tax_usd moves. The guest price cannot
-- change as a result of a tax rate change. That property is the whole point.
--
-- ── HOW THIS RELATES TO WHAT IS ACTUALLY APPLIED ──────────────────────────
-- Applied via the Supabase MCP, NOT the Supabase CLI. Do not run `supabase db
-- push` against this directory. This file is the versioned record so schema
-- history lives in git rather than only in the database.
--
-- The live database recorded these as two separate MCP migrations:
--     price_resolver_draft   → resolve_nightly_prices
--     quote_functions        → quote_nightly_prices, quote_units
-- This file mirrors both, and matches the applied signatures (the resolver's
-- return includes price_origin). Idempotent — safe to re-apply.
--
-- GAP: the Phase A migrations (phase_a_part1 … phase_a_part3 — hold expiry,
-- the paid-cancel guard, webhook_deliveries, the constraint dedupe) exist ONLY
-- in the database and in Supabase's own migration history. They are not in
-- this repo. Export them from the live project and add them here so the whole
-- schema history is reviewable in git.
-- ═══════════════════════════════════════════════════════════════════════════

-- DROP before CREATE: the return signature changed between drafts, and
-- CREATE OR REPLACE FUNCTION cannot alter a return type.
DROP FUNCTION IF EXISTS public.resolve_nightly_prices(uuid, date, date);
DROP FUNCTION IF EXISTS public.quote_nightly_prices(uuid, date, date);
DROP FUNCTION IF EXISTS public.quote_units(uuid[], date, date);

-- ───────────────────────────────────────────────────────────────────────────
-- resolve_nightly_prices — the single price authority.
-- Returns the owner's cost. service_role only. NEVER expose to anon.
-- ───────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.resolve_nightly_prices(
  p_unit_id   uuid,
  p_check_in  date,
  p_check_out date
)
RETURNS TABLE (
  night              date,
  host_price_usd     numeric,
  commission_percent numeric,
  commission_usd     numeric,
  commission_tax_usd numeric,
  customer_price_usd numeric,
  was_fallback       boolean,
  price_origin       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- No tax rate is in force. Deliberately hardcoded rather than configured:
  -- we do not build configuration screens for a value that is currently zero.
  c_tax_pct CONSTANT numeric := 0;

  v_cost          numeric;
  v_comm_pct      numeric;
  v_nights        integer;
  v_stay_discount numeric := 0;
  v_bad_ccy       integer;
BEGIN
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'check_out (%) must be after check_in (%)', p_check_out, p_check_in;
  END IF;
  v_nights := p_check_out - p_check_in;

  SELECT u.cost_price, u.commission_percent
    INTO v_cost, v_comm_pct
  FROM public.units u
  WHERE u.id = p_unit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit % not found', p_unit_id USING ERRCODE = 'no_data_found';
  END IF;

  -- The only true block. Such units are already unlisted by status.
  IF v_cost IS NULL THEN
    RAISE EXCEPTION 'unit % has no cost_price and is not sellable', p_unit_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF v_comm_pct IS NULL THEN
    RAISE EXCEPTION 'unit % has no commission_percent', p_unit_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Seasonal rows must be USD. Never convert silently (CLAUDE.md §9).
  SELECT count(*) INTO v_bad_ccy
  FROM public.unit_daily_prices dp
  WHERE dp.unit_id = p_unit_id
    AND dp.date >= p_check_in AND dp.date < p_check_out
    AND dp.is_active
    AND COALESCE(dp.currency, 'USD') <> 'USD';

  IF v_bad_ccy > 0 THEN
    RAISE EXCEPTION 'unit % has % non-USD daily price row(s) in range', p_unit_id, v_bad_ccy
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Stay-length discount: the per-night fallback, not the primary source.
  SELECT r.discount_percent INTO v_stay_discount
  FROM public.unit_pricing_rules r
  WHERE r.unit_id = p_unit_id
    AND r.is_active
    AND v_nights >= r.min_nights
    AND (r.max_nights IS NULL OR v_nights <= r.max_nights)
  ORDER BY (COALESCE(r.max_nights, 2147483647) - r.min_nights) ASC,  -- narrowest band
           r.discount_percent DESC
  LIMIT 1;
  v_stay_discount := COALESCE(v_stay_discount, 0);

  RETURN QUERY
  WITH nights AS (
    SELECT d::date AS night
    FROM generate_series(p_check_in, p_check_out - 1, interval '1 day') AS d
  ),
  ovr AS (
    -- One winning override per night. Overlapping rows are possible (no
    -- constraint prevents them), so the tie-break is explicit: narrowest range
    -- wins as the most specific instruction, then most recent, then id.
    -- NOTE: end_date is treated as INCLUSIVE. The calendar table uses the
    -- opposite convention for its own end_date — see the column comment.
    SELECT n.night, o.override_price, o.discount_percent
    FROM nights n
    LEFT JOIN LATERAL (
      SELECT o2.override_price, o2.discount_percent
      FROM public.unit_pricing_overrides o2
      WHERE o2.unit_id = p_unit_id
        AND o2.is_active
        AND n.night >= o2.start_date
        AND n.night <= o2.end_date
      ORDER BY (o2.end_date - o2.start_date) ASC,
               o2.updated_at DESC NULLS LAST,
               o2.id
      LIMIT 1
    ) o ON true
  ),
  base AS (
    SELECT
      o.night,
      COALESCE(o.override_price, dp.host_price_usd, v_cost) AS night_cost,
      CASE WHEN o.override_price  IS NOT NULL THEN 'override_price'
           WHEN dp.host_price_usd IS NOT NULL THEN 'daily'
           ELSE 'unit_cost' END                             AS origin,
      -- An absolute price is a more specific instruction than a modifier:
      -- when override_price applies, ALL discounting is bypassed.
      CASE WHEN o.override_price IS NOT NULL THEN 0
           ELSE COALESCE(o.discount_percent, v_stay_discount) END AS eff_discount
    FROM ovr o
    LEFT JOIN public.unit_daily_prices dp
           ON dp.unit_id = p_unit_id
          AND dp.date    = o.night
          AND dp.is_active
  ),
  priced AS (
    SELECT b.night, b.origin,
           round(b.night_cost * (1 - b.eff_discount / 100.0), 2) AS host_after_disc
    FROM base b
  ),
  grossed AS (
    SELECT p.*,
           round(p.host_after_disc * v_comm_pct / 100.0, 2) AS gross_commission
    FROM priced p
  )
  SELECT
    g.night,
    g.host_after_disc,
    v_comm_pct,
    -- Net commission: gross with the tax component carved out.
    round(g.gross_commission / (1 + c_tax_pct / 100.0), 2),
    -- Tax by SUBTRACTION, never a second independent round(). This is what
    -- keeps booking_nightly_prices' CHECK satisfied exactly, at any tax rate.
    g.gross_commission - round(g.gross_commission / (1 + c_tax_pct / 100.0), 2),
    -- Customer price is the literal sum. Never recomputed independently.
    g.host_after_disc + g.gross_commission,
    (g.origin = 'unit_cost'),
    g.origin
  FROM grossed g
  ORDER BY g.night;
END;
$$;

COMMENT ON FUNCTION public.resolve_nightly_prices(uuid, date, date) IS
  'Single price authority. Returns owner cost — service_role only, never anon. '
  'Guest-facing callers must use quote_nightly_prices or quote_units.';

REVOKE ALL ON FUNCTION public.resolve_nightly_prices(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_nightly_prices(uuid, date, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_nightly_prices(uuid, date, date) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- quote_nightly_prices — guest-safe, single unit, per-night breakdown.
-- ───────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.quote_nightly_prices(
  p_unit_id   uuid,
  p_check_in  date,
  p_check_out date
)
RETURNS TABLE (night date, customer_price_usd numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- anon may pass any uuid, so the public-visibility filter is enforced here.
  IF NOT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = p_unit_id
      AND u.status = 'available'
      AND u.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unit not available' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
  SELECT r.night, r.customer_price_usd
  FROM public.resolve_nightly_prices(p_unit_id, p_check_in, p_check_out) r;
END;
$$;

REVOKE ALL ON FUNCTION public.quote_nightly_prices(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_nightly_prices(uuid, date, date)
  TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- quote_units — guest-safe, batched. One call per listing page, not per card.
--
-- MEASURED 2026-07-19 on the live project (150 sellable units):
--     dateless   1.6 ms   (252 shared buffers)
--     dated x7 104.1 ms  (4844 shared buffers)
-- All buffer hits, no disk — the 64x gap is CPU in 150 separate plpgsql
-- invocations of resolve_nightly_prices via the LATERAL below, each with its
-- own generate_series and four table lookups. Acceptable at 150 units on a
-- force-dynamic page, and it runs concurrently with the policy fetch.
--
-- FOLLOW-UP (scheduled, not hypothetical): cost is roughly linear in unit
-- count, so ~300 units lands near 200 ms and past our 150 ms budget. Before
-- the catalogue reaches that size, rewrite this dated branch as ONE set-based
-- query over all units rather than a per-unit LATERAL. Note EXPLAIN cannot see
-- inside a plpgsql function — to find which of the four lookups dominates,
-- use auto_explain or instrument manually.
-- ───────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.quote_units(
  p_unit_ids  uuid[],
  p_check_in  date DEFAULT NULL,
  p_check_out date DEFAULT NULL
)
RETURNS TABLE (
  unit_id     uuid,
  nightly_usd numeric,
  total_usd   numeric,
  nights      integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dated boolean := (p_check_in IS NOT NULL
                      AND p_check_out IS NOT NULL
                      AND p_check_out > p_check_in);
BEGIN
  IF NOT v_dated THEN
    -- Representative nightly rate: cost x (1 + commission), computed live.
    -- Same formula base_nightly_price cached, but never stale.
    RETURN QUERY
    SELECT u.id,
           round(u.cost_price * (1 + u.commission_percent / 100.0), 2),
           NULL::numeric,
           NULL::integer
    FROM public.units u
    WHERE u.id = ANY (p_unit_ids)
      AND u.status = 'available'
      AND u.archived_at IS NULL
      AND u.cost_price IS NOT NULL
      AND u.commission_percent IS NOT NULL;
  ELSE
    -- Dated: the resolver's SUM over the stay. Never nightly x nights, which
    -- would ignore seasonal daily prices and every length-of-stay discount.
    RETURN QUERY
    SELECT v.id,
           round(q.total / NULLIF(q.n, 0), 2),   -- average/night, display only
           q.total,
           q.n
    FROM (
      SELECT u.id
      FROM public.units u
      WHERE u.id = ANY (p_unit_ids)
        AND u.status = 'available'
        AND u.archived_at IS NULL
        AND u.cost_price IS NOT NULL
        AND u.commission_percent IS NOT NULL
    ) v
    CROSS JOIN LATERAL (
      SELECT sum(r.customer_price_usd) AS total, count(*)::int AS n
      FROM public.resolve_nightly_prices(v.id, p_check_in, p_check_out) r
    ) q
    WHERE q.n > 0;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.quote_units(uuid[], date, date) IS
  'Batched guest-facing pricing. Dates omitted returns the representative '
  'nightly rate; dates supplied returns the resolver SUM for the stay.';

REVOKE ALL ON FUNCTION public.quote_units(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_units(uuid[], date, date)
  TO anon, authenticated, service_role;
