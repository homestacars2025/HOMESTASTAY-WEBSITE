-- ═══════════════════════════════════════════════════════════════════════════
-- Booking flow RPCs — Homesta Stay (project djtpksherrayzxmunvkv)
--
-- Three transaction boundaries, three functions:
--   create_booking_hold      customer + booking + nightly prices + FX lock
--   start_payment_attempt    attempt row + hold extension, before the bank
--   complete_payment         paid transition, after a successful provision
--
-- WHY THESE ARE FUNCTIONS AND NOT APP CODE
--   PostgREST runs one statement per request, so supabase-js cannot write a
--   booking and its booking_nightly_prices rows in the same transaction. A
--   crash between two .insert() calls would leave a booking whose amount
--   cannot be proven. Atomicity has to live here.
--   It also lets 23P01 be caught in plpgsql, where the implicit savepoint
--   cleanly undoes the partial insert, instead of parsed in TypeScript.
--
-- SECURITY
--   All three are SECURITY DEFINER and granted to service_role ONLY.
--   They are never reachable by anon. If create_booking_hold were public,
--   anyone could hold every unit for 30 minutes on repeat and shut down
--   sales — an availability attack that costs the attacker nothing.
--   The app calls them from Server Actions with the service key, and must
--   rate-limit by IP before doing so.
--
-- VERIFIED AGAINST THE LIVE DB (2026-07-20), most of it before first run —
-- customers.full_name was the one that got through, caught by 428C9 on the
-- very first create_booking_hold call:
--   customers.full_name       GENERATED. Never name it in an INSERT.
--   lock_booking_fx           RETURNS TABLE(fx_rate numeric, amount_try numeric)
--   channels                  HOMESTA.COM / AIRBNB.COM / BOOKING.COM / VRBO.COM
--   booking_nightly_prices    id, booking_id, date, host_price_usd,
--                             commission_percent, commission_usd,
--                             commission_tax_usd, customer_price_usd,
--                             source_at_booking, was_fallback, created_at
--   price_source              enum for source_at_booking (NOT
--                             source_at_booking_type)
--   booking_payments.status   initiated → 3ds_pending → provision_pending
--                             → paid | failed, plus refunded,
--                             partially_refunded. 'pending' no longer exists.
--   booking_source_type       manual, ota, agent, website
--
-- APPLIED VIA THE SUPABASE MCP, not the Supabase CLI. This file is the git
-- record. Idempotent — safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. create_booking_hold
--
-- One transaction: match/create the customer, insert the booking as 'hold',
-- write every nightly price row from the resolver, derive the total, lock FX.
--
-- Never accepts an amount from the caller. The client sends unit, dates,
-- guests and the lead guest's details — nothing that can influence price.
-- The figure charged is derived from the same resolver that produced the
-- quote, so quoted and charged agree by construction, not by comparison.
--
-- Returns a status rather than raising, so the app never sees a 500:
--   created        booking is held, proceed to payment
--   resumed        this guest already held exactly these dates; same booking
--   own_hold       this guest holds OVERLAPPING but different dates
--   unavailable    lost the race, or someone else holds it (23P01)
--   not_bookable   unit is not sellable (no cost_price, hidden, archived)
--   invalid        input failed validation
--
-- The one deliberate exception is a stale FX rate: current_try_rate raises
-- inside lock_booking_fx, which aborts this whole transaction — no booking,
-- no customer row, no sale. Refusing to sell beats selling at a rate that is
-- 72 days out of date.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_booking_hold(
  p_unit_id     uuid,
  p_check_in    date,
  p_check_out   date,
  p_guests      integer,
  p_first_name  text,
  p_last_name   text,
  p_email       text,
  p_phone       text,                       -- E.164, e.g. +905309373810
  p_nationality text DEFAULT NULL,
  p_source_type text DEFAULT 'website'
)
RETURNS TABLE (
  status           text,
  booking_id       uuid,
  booking_reference text,
  total_usd        numeric,
  amount_try       numeric,
  fx_rate          numeric,
  hold_expires_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_nights      integer;
  v_customer_id uuid;
  v_booking_id  uuid;
  v_reference   text;
  v_total       numeric;
  v_conflict    boolean := false;
  v_existing    record;
  v_unit        record;
  v_max_guests  integer;
  v_channel_id  uuid;
  v_fx          record;
  v_hold_until  timestamptz;
  v_phone       text;
  v_email       text;
BEGIN
  -- ── Input validation ─────────────────────────────────────────────────────
  v_phone := btrim(coalesce(p_phone, ''));
  v_email := lower(btrim(coalesce(p_email, '')));

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in
     OR p_check_in < current_date
     OR coalesce(p_guests, 0) < 1
     OR btrim(coalesce(p_first_name, '')) = ''
     OR btrim(coalesce(p_last_name, ''))  = ''
     OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     -- E.164: leading +, country digit 1-9, 7-15 digits total.
     OR v_phone !~ '^\+[1-9][0-9]{6,14}$'
  THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text,
                        NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  v_nights := p_check_out - p_check_in;

  -- ── Unit must be publicly sellable ───────────────────────────────────────
  SELECT u.id, u.min_nights, u.cost_price, u.commission_percent
    INTO v_unit
  FROM public.units u
  WHERE u.id = p_unit_id
    AND u.status = 'available'
    AND u.archived_at IS NULL;

  IF NOT FOUND OR v_unit.cost_price IS NULL OR v_unit.commission_percent IS NULL THEN
    RETURN QUERY SELECT 'not_bookable'::text, NULL::uuid, NULL::text,
                        NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_nights < coalesce(v_unit.min_nights, 1) THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text,
                        NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT s.max_guests INTO v_max_guests
  FROM public.unit_specifications s WHERE s.unit_id = p_unit_id LIMIT 1;

  IF v_max_guests IS NOT NULL AND p_guests > v_max_guests THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::text,
                        NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  -- ── Customer: match on E.164 phone, else create ──────────────────────────
  -- Phone is the stronger key in this market. On a match we fill only NULL
  -- columns: customers is a CRM table the team edits by hand, and a booking
  -- form must never clobber their work.
  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.phone = v_phone
  ORDER BY c.created_at
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    -- full_name is a GENERATED column — Postgres derives it from first/last.
    -- Listing it here raises 428C9 and aborts the whole hold.
    INSERT INTO public.customers (first_name, last_name, email, phone, nationality)
    VALUES (btrim(p_first_name), btrim(p_last_name),
            v_email, v_phone, p_nationality)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.customers c
       SET email       = COALESCE(c.email, v_email),
           nationality = COALESCE(c.nationality, p_nationality),
           first_name  = COALESCE(NULLIF(btrim(c.first_name), ''), btrim(p_first_name)),
           last_name   = COALESCE(NULLIF(btrim(c.last_name),  ''), btrim(p_last_name)),
           updated_at  = now()
     WHERE c.id = v_customer_id;
  END IF;

  -- Website bookings are attributed to the Homesta channel AND carry
  -- source_type 'website'. A future eTravel integration is source_type
  -- 'agent' plus its own channels row — no new column.
  SELECT ch.id INTO v_channel_id
  FROM public.channels ch
  WHERE upper(ch.name) = 'HOMESTA.COM'
  LIMIT 1;

  -- ── The booking. bookings_no_overlap is the guard, not an app check. ─────
  -- nights is GENERATED — never inserted. booking_reference and
  -- hold_expires_at are set by their BEFORE triggers.
  BEGIN
    INSERT INTO public.bookings (
      unit_id, customer_id, check_in, check_out, guests_count,
      status, source_type, source_note, channel_id
    )
    VALUES (
      p_unit_id, v_customer_id, p_check_in, p_check_out, p_guests,
      'hold', p_source_type::booking_source_type, 'homestastay.com', v_channel_id
    )
    RETURNING id, booking_reference, bookings.hold_expires_at
         INTO v_booking_id, v_reference, v_hold_until;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- Rolls back to this block's savepoint: the partial insert is gone.
      v_conflict := true;
  END;

  IF v_conflict THEN
    -- A guest can lose the race to themselves: double-tapping Book, or
    -- returning within the hold window. Telling them the unit is taken when
    -- their own hold is holding it is the worst possible message.
    SELECT b.id, b.booking_reference, b.check_in, b.check_out,
           b.total_amount_usd, b.hold_expires_at
      INTO v_existing
    FROM public.bookings b
    WHERE b.unit_id = p_unit_id
      AND b.customer_id = v_customer_id
      AND b.status = 'hold'
      AND b.paid_at IS NULL
      AND daterange(b.check_in, b.check_out, '[)')
       && daterange(p_check_in, p_check_out, '[)')
    ORDER BY b.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.check_in = p_check_in AND v_existing.check_out = p_check_out THEN
        -- Same guest, same dates: hand back the booking they already have.
        SELECT * INTO v_fx FROM public.lock_booking_fx(v_existing.id);   -- idempotent
        RETURN QUERY SELECT 'resumed'::text, v_existing.id, v_existing.booking_reference,
                            v_existing.total_amount_usd, v_fx.amount_try, v_fx.fx_rate,
                            v_existing.hold_expires_at;
        RETURN;
      END IF;

      -- Overlapping but different dates — their own hold is in the way.
      RETURN QUERY SELECT 'own_hold'::text, v_existing.id, v_existing.booking_reference,
                          v_existing.total_amount_usd, NULL::numeric, NULL::numeric,
                          v_existing.hold_expires_at;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid, NULL::text,
                        NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz;
    RETURN;
  END IF;

  -- ── Nightly prices, same transaction as the booking ──────────────────────
  -- resolve_nightly_prices is service-role only; SECURITY DEFINER reaches it.
  INSERT INTO public.booking_nightly_prices (
    booking_id, date, host_price_usd, commission_percent,
    commission_usd, commission_tax_usd, customer_price_usd,
    source_at_booking, was_fallback
  )
  SELECT v_booking_id, r.night, r.host_price_usd, r.commission_percent,
         r.commission_usd, r.commission_tax_usd, r.customer_price_usd,
         'engine'::price_source,
         r.was_fallback
  FROM public.resolve_nightly_prices(p_unit_id, p_check_in, p_check_out) r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resolver returned no nights for unit % (% .. %)',
      p_unit_id, p_check_in, p_check_out;
  END IF;

  SELECT sum(bnp.customer_price_usd) INTO v_total
  FROM public.booking_nightly_prices bnp WHERE bnp.booking_id = v_booking_id;

  UPDATE public.bookings SET total_amount_usd = v_total WHERE id = v_booking_id;

  -- ── FX lock. Raises on a stale rate, aborting everything above. ──────────
  SELECT * INTO v_fx FROM public.lock_booking_fx(v_booking_id);

  RETURN QUERY SELECT 'created'::text, v_booking_id, v_reference,
                      v_total, v_fx.amount_try, v_fx.fx_rate, v_hold_until;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_hold(uuid, date, date, integer, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_hold(uuid, date, date, integer, text, text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_hold(uuid, date, date, integer, text, text, text, text, text, text) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. start_payment_attempt
--
-- Called immediately before redirecting to the bank. Writes the attempt row
-- FIRST, so that a provision which succeeds while our write path dies still
-- has a record to reconcile against — money that moved is never invisible.
--
-- Also extends the hold: the 30-minute clock starts when the hold is created
-- and has to cover the details form as well as the bank round-trip. A guest
-- who spends 22 minutes typing would otherwise have 8 minutes for 3DS, and a
-- hold expiring mid-payment is the one failure that takes money for a
-- cancelled booking.
--
-- ⚠️ THE APP OWNS THE NEXT TWO TRANSITIONS. This function leaves the attempt
-- at 'initiated' because nothing has been sent to the bank yet. The app must:
--     'initiated'        → '3ds_pending'        before redirecting to PayGate
--     '3ds_pending'      → 'provision_pending'  BEFORE calling ProvisionGate
-- That second one is load-bearing: 'provision_pending' means "money may have
-- moved", and it is what the reconciliation sweep looks for. Setting it after
-- the bank call would leave the exact window it exists to close.
--
-- Statuses: started | not_holdable | already_paid | not_found
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.start_payment_attempt(
  p_booking_id uuid
)
RETURNS TABLE (
  status            text,
  merchant_order_id text,
  amount_try        numeric,
  amount_minor      bigint,
  fx_rate           numeric,
  booking_reference text,
  total_usd         numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_b      record;
  v_fx     record;
  v_moid   text;
  v_minor  bigint;
BEGIN
  -- FOR UPDATE: two concurrent taps on Pay serialise here rather than
  -- interleaving into two live attempts.
  SELECT b.id, b.booking_reference, b.status, b.paid_at,
         b.total_amount_usd, b.hold_expires_at
    INTO v_b
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::text, NULL::numeric,
                        NULL::bigint, NULL::numeric, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  IF v_b.paid_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.booking_payments bp
                 WHERE bp.booking_id = p_booking_id AND bp.status = 'paid')
  THEN
    RETURN QUERY SELECT 'already_paid'::text, NULL::text, NULL::numeric,
                        NULL::bigint, NULL::numeric, v_b.booking_reference, v_b.total_amount_usd;
    RETURN;
  END IF;

  IF v_b.status <> 'hold' THEN
    RETURN QUERY SELECT 'not_holdable'::text, NULL::text, NULL::numeric,
                        NULL::bigint, NULL::numeric, v_b.booking_reference, v_b.total_amount_usd;
    RETURN;
  END IF;

  -- Idempotent: returns the already-locked rate if there is one, so a retry
  -- 25 minutes later is charged the rate the guest was quoted.
  SELECT * INTO v_fx FROM public.lock_booking_fx(p_booking_id);

  -- Integer minor units, computed ONCE and stored. DisplayAmount must equal
  -- Amount, and a refund must replay this exact figure — so it can never be
  -- recomputed later from the USD total.
  v_minor := round(v_fx.amount_try * 100)::bigint;

  -- Unique per attempt (bank rejects reuse), and recoverable back to the
  -- reference: the 3DS callback is a cross-site POST with no cookies, so this
  -- string is the only identity we get back.
  -- CHECK against Kuveyt Türk's MerchantOrderId max length:
  --   length(booking_reference) + 9.
  v_moid := v_b.booking_reference || '-' || encode(gen_random_bytes(4), 'hex');

  -- amount_usd is stored alongside amount_try so a refund can be reconciled
  -- against the USD figure the booking was quoted in without re-deriving it.
  -- status is set explicitly: the column DEFAULT is still 'pending', which the
  -- current CHECK no longer accepts.
  INSERT INTO public.booking_payments (
    booking_id, merchant_order_id, amount_try, amount_usd, fx_rate_used, status
  )
  VALUES (
    p_booking_id, v_moid, v_fx.amount_try, v_b.total_amount_usd, v_fx.fx_rate, 'initiated'
  );

  -- Guarantee a full window for the bank round-trip regardless of how long
  -- the form took. Updating hold_expires_at alone does not re-fire
  -- bookings_set_hold_expiry (that trigger is ON UPDATE OF status,
  -- hold_duration_minutes), so the extension sticks.
  UPDATE public.bookings
     SET hold_expires_at = GREATEST(coalesce(hold_expires_at, now()), now() + interval '20 minutes')
   WHERE id = p_booking_id;

  RETURN QUERY SELECT 'started'::text, v_moid, v_fx.amount_try, v_minor,
                      v_fx.fx_rate, v_b.booking_reference, v_b.total_amount_usd;
END;
$$;

REVOKE ALL ON FUNCTION public.start_payment_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_payment_attempt(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_payment_attempt(uuid) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. complete_payment
--
-- Called after ProvisionGate returns success. One transaction moves the
-- attempt to 'paid' and the booking to paid_at — which is the edge that fires
-- trg_notify_booking_paid and sends the owner their WhatsApp prompt.
--
-- Every bank reference is mandatory here: without RRN, Stan, ProvisionNumber
-- and the bank OrderId a refund is IMPOSSIBLE, so a payment that cannot be
-- refunded must never be recorded as paid.
--
-- Deliberately permissive about the attempt's PRIOR state (any of initiated,
-- 3ds_pending, provision_pending, failed is accepted). Money that reached the
-- bank must be recordable even if our own state machine got out of step;
-- refusing a real provision because a prior UPDATE was missed would lose it.
--
-- Statuses:
--   paid              normal path; owner prompt fires
--   already_paid      exact replay of a callback — no-op, same result
--   already_refunded  anomaly: a refunded attempt reported as paid. No write.
--   duplicate_payment this booking was already paid by ANOTHER attempt.
--                     Money moved twice. Caller MUST refund this attempt.
--   booking_canceled  the hold expired while the guest was at the bank.
--                     Money moved. Caller MUST refund. paid_at is deliberately
--                     NOT set, so no owner is prompted for a dead booking.
--   unknown_attempt   no such merchant_order_id
--   invalid           a bank reference was missing
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_payment(
  p_merchant_order_id text,
  p_bank_order_id     text,
  p_provision_number  text,
  p_rrn               text,
  p_stan              text
)
RETURNS TABLE (
  status            text,
  booking_id        uuid,
  booking_reference text,
  amount_try        numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_p record;
  v_b record;
BEGIN
  SELECT bp.id, bp.booking_id, bp.status, bp.amount_try
    INTO v_p
  FROM public.booking_payments bp
  WHERE bp.merchant_order_id = p_merchant_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown_attempt'::text, NULL::uuid, NULL::text, NULL::numeric;
    RETURN;
  END IF;

  -- Exact replay: the bank retries callbacks. Return the same answer, change
  -- nothing, and above all do not provision or notify again.
  IF v_p.status = 'paid' THEN
    SELECT b.booking_reference INTO v_b FROM public.bookings b WHERE b.id = v_p.booking_id;
    RETURN QUERY SELECT 'already_paid'::text, v_p.booking_id, v_b.booking_reference, v_p.amount_try;
    RETURN;
  END IF;

  -- Money already went back. Re-marking it paid would corrupt the ledger and
  -- make the refund unaccountable.
  IF v_p.status IN ('refunded', 'partially_refunded') THEN
    SELECT b.booking_reference INTO v_b FROM public.bookings b WHERE b.id = v_p.booking_id;
    RETURN QUERY SELECT 'already_refunded'::text, v_p.booking_id, v_b.booking_reference, v_p.amount_try;
    RETURN;
  END IF;

  -- No refundable payment, no paid status. This is the structural guarantee
  -- that we can always give the money back.
  IF coalesce(btrim(p_bank_order_id), '') = ''
     OR coalesce(btrim(p_provision_number), '') = ''
     OR coalesce(btrim(p_rrn), '') = ''
     OR coalesce(btrim(p_stan), '') = ''
  THEN
    RETURN QUERY SELECT 'invalid'::text, v_p.booking_id, NULL::text, v_p.amount_try;
    RETURN;
  END IF;

  SELECT b.id, b.booking_reference, b.status, b.paid_at
    INTO v_b
  FROM public.bookings b
  WHERE b.id = v_p.booking_id
  FOR UPDATE;

  UPDATE public.booking_payments
     SET status           = 'paid',
         bank_order_id    = p_bank_order_id,
         provision_number = p_provision_number,
         rrn              = p_rrn,
         stan             = p_stan,
         paid_at          = now(),
         updated_at       = now()
   WHERE id = v_p.id;

  -- Another attempt already paid for this booking. The partial unique index
  -- on booking_payments should have made this impossible — but if we got
  -- here, the money is real and has to go back.
  IF v_b.paid_at IS NOT NULL THEN
    RETURN QUERY SELECT 'duplicate_payment'::text, v_b.id, v_b.booking_reference, v_p.amount_try;
    RETURN;
  END IF;

  -- The hold expired while the guest was at the bank and expire_holds()
  -- cancelled it. Never discard a successful provision: record it, report it,
  -- refund it. paid_at stays NULL so no owner is prompted for a dead booking.
  IF v_b.status <> 'hold' THEN
    RETURN QUERY SELECT 'booking_canceled'::text, v_b.id, v_b.booking_reference, v_p.amount_try;
    RETURN;
  END IF;

  -- The paid_at NULL -> NOT NULL edge fires trg_notify_booking_paid exactly
  -- once. Clearing hold_expires_at also removes the row from the expiry cron's
  -- partial index, on top of that cron's own paid_at IS NULL filter and the
  -- guard_paid_booking_cancel trigger.
  UPDATE public.bookings
     SET paid_at               = now(),
         owner_decision_due_at = now() + interval '12 hours',
         hold_expires_at       = NULL
   WHERE id = v_b.id;

  RETURN QUERY SELECT 'paid'::text, v_b.id, v_b.booking_reference, v_p.amount_try;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_payment(text, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment(text, text, text, text, text) TO service_role;

COMMIT;
