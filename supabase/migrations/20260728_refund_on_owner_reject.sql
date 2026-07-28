-- ═══════════════════════════════════════════════════════════════════════════
-- Auto-refund on owner rejection — Homesta Stay (project djtpksherrayzxmunvkv)
--
-- The legal documents (Ön Bilgilendirme / Mesafeli Satış) promise a FULL
-- refund when a paid booking is not approved. This wires that: when a paid
-- booking's owner_decision transitions to 'rejected', fire an async pg_net POST
-- to the guest site's /api/payment/refund, which runs the SaleReversal /
-- DrawBack. The route is idempotent (booking_refunds unique guard) and gated
-- (REFUND_LIVE_ENABLED) — safe to wire before enabling the live bank call.
--
-- A trigger, NOT an edit to resolve_owner_reply, so it catches the transition
-- no matter what sets it — the owner's WhatsApp reply OR a 12h-timeout sweep.
-- (Confirm the timeout path sets owner_decision='rejected'; if it uses another
--  value, add it to the condition below.)
--
-- CONFIG (set once, NOT committed — keeps the secret out of git):
--   ALTER DATABASE postgres SET app.refund_url    = 'https://www.homestastay.com/api/payment/refund';
--   ALTER DATABASE postgres SET app.refund_secret = '<same value as Vercel REFUND_TRIGGER_SECRET>';
-- Then: SELECT pg_reload_conf();  (or reconnect) so current_setting sees them.
--
-- pg_net is async: it queues the request in net.http_request_queue, which is
-- transactional — if the rejection rolls back, the refund call is never sent.
-- Idempotent — safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.refund_on_owner_reject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_moid   text;
  v_url    text := current_setting('app.refund_url', true);
  v_secret text := current_setting('app.refund_secret', true);
BEGIN
  -- Only on the transition INTO 'rejected', and only for a PAID booking.
  IF NEW.owner_decision = 'rejected'
     AND COALESCE(OLD.owner_decision, '') <> 'rejected'
     AND NEW.paid_at IS NOT NULL
  THEN
    -- The paid attempt's merchant_order_id is the refund target.
    SELECT bp.merchant_order_id
      INTO v_moid
    FROM public.booking_payments bp
    WHERE bp.booking_id = NEW.id
      AND bp.status = 'paid'
    ORDER BY bp.paid_at DESC
    LIMIT 1;

    IF v_moid IS NULL THEN
      RAISE WARNING '[refund-trigger] no paid attempt for booking % — no refund fired', NEW.id;
      RETURN NEW;
    END IF;
    IF v_url IS NULL OR v_secret IS NULL THEN
      RAISE WARNING '[refund-trigger] app.refund_url / app.refund_secret not set — refund NOT fired for %', v_moid;
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'x-refund-secret', v_secret
                 ),
      body    := jsonb_build_object(
                   'merchantOrderId', v_moid,
                   'reason',          'rejected'
                 )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_on_owner_reject ON public.bookings;
CREATE TRIGGER trg_refund_on_owner_reject
  AFTER UPDATE OF owner_decision ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.refund_on_owner_reject();

COMMIT;
