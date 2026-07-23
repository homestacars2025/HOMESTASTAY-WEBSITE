-- ═══════════════════════════════════════════════════════════════════════════
-- booking_refunds — Homesta Stay (project djtpksherrayzxmunvkv)
--
-- One row per refund attempt against a paid booking_payments row. Refund state
-- lives HERE, not only on booking_payments.status, for three reasons:
--   1. The refund returns NEW bank references (RRN/Stan/ProvisionNumber/OrderId/
--      BusinessKey) distinct from the original sale — they must be stored for
--      audit and any later reconciliation.
--   2. Idempotency: a partial unique index makes a double-fire (pg_net retry,
--      bank callback replay) a no-op instead of a double reversal.
--   3. Partial refunds (future) need per-attempt amounts to track the total
--      refunded against the original sale.
--
-- booking_payments.status flips to 'refunded' / 'partially_refunded' ONLY when
-- the bank returns success. A network failure leaves the row 'pending' — never
-- 'succeeded' and never 'failed', because we cannot know whether money moved
-- (same philosophy as provision_pending on the payment side).
--
-- SECURITY: RLS on, no policies — service_role only, like the payment tables.
-- Applied via the Supabase MCP. Idempotent — safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_refunds (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  booking_payment_id   uuid NOT NULL REFERENCES public.booking_payments(id),
  -- Denormalised for convenient lookups; the payment row is the source of truth.
  booking_id           uuid REFERENCES public.bookings(id),

  -- Why the refund fires. All three of these are FULL refunds today; a partial
  -- flow would add its own reason.
  reason               text NOT NULL
                         CHECK (reason IN ('rejected','duplicate_payment','booking_canceled')),

  -- Which bank operation was used. Decided from the Istanbul-day heuristic and
  -- updated if a SaleReversal falls back to DrawBack.
  txn_type             text
                         CHECK (txn_type IN ('SaleReversal','DrawBack','PartialDrawback')),

  -- Amount refunded (minor→major, TRY). Full sale for SaleReversal/DrawBack,
  -- the partial figure for PartialDrawback. Never exceeds the original sale.
  amount_try           numeric NOT NULL,

  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','succeeded','failed')),

  -- Request references — copied from the ORIGINAL paid sale.
  merchant_order_id    text,
  req_rrn              text,
  req_stan             text,
  req_provision_number text,
  req_order_id         text,

  -- Response references — NEW, returned by the refund. Distinct from the sale's.
  res_rrn              text,
  res_stan             text,
  res_provision_number text,
  res_order_id         text,
  res_transaction_time text,
  res_business_key     text,
  res_response_code    text,
  res_response_message text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Idempotency guard ────────────────────────────────────────────────────────
-- At most one non-failed refund per payment. The route claims the slot with
-- INSERT ... ON CONFLICT DO NOTHING: if a pending/succeeded refund already
-- exists the insert affects zero rows and the route no-ops. A 'failed' refund
-- leaves the slot free for a deliberate retry.
CREATE UNIQUE INDEX IF NOT EXISTS booking_refunds_one_active
  ON public.booking_refunds (booking_payment_id)
  WHERE status <> 'failed';

CREATE INDEX IF NOT EXISTS booking_refunds_booking_id_idx
  ON public.booking_refunds (booking_id);

-- ── updated_at ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_booking_refunds_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_refunds_updated_at ON public.booking_refunds;
CREATE TRIGGER trg_booking_refunds_updated_at
  BEFORE UPDATE ON public.booking_refunds
  FOR EACH ROW EXECUTE FUNCTION public.touch_booking_refunds_updated_at();

-- ── RLS: service_role only ───────────────────────────────────────────────────
ALTER TABLE public.booking_refunds ENABLE ROW LEVEL SECURITY;
-- No policies: anon / authenticated get nothing; service_role bypasses RLS.
REVOKE ALL ON public.booking_refunds FROM anon, authenticated;

COMMIT;
