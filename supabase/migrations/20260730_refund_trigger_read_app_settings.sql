-- ═══════════════════════════════════════════════════════════════════════════
-- Reconcile refund_on_owner_reject() with production — Homesta Stay
-- (project djtpksherrayzxmunvkv)
--
-- WHY THIS MIGRATION EXISTS
-- The original 20260728_refund_on_owner_reject.sql read its config from
-- database parameters via current_setting('app.refund_url' / 'app.refund_secret'),
-- set with ALTER DATABASE ... SET app.*. That approach is BLOCKED on Supabase
-- managed Postgres: even the `postgres` role in the SQL Editor gets 42501
-- permission denied, so those settings were never applied and current_setting()
-- always returned NULL — the trigger could never have fired a refund.
--
-- Production was fixed by moving the two values into rows in public.app_settings
-- (key text, value text; keys 'refund_url' and 'refund_secret') and rewriting the
-- function to SELECT them from there. This migration re-creates that exact live
-- version so a migrate-from-scratch or a rollback does NOT silently restore the
-- broken current_setting() function. It does NOT edit 20260728 (that would break
-- the sequence for any environment that already applied it) and does NOT touch
-- the trigger binding (trg_refund_on_owner_reject is already correct and enabled).
--
-- The function body below is byte-for-byte the live definition
-- (pg_get_functiondef). Idempotent: CREATE OR REPLACE FUNCTION — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.refund_on_owner_reject()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_moid   text;
  v_url    text;
  v_secret text;
BEGIN
  IF NEW.owner_decision = 'rejected'
     AND COALESCE(OLD.owner_decision, '') <> 'rejected'
     AND NEW.paid_at IS NOT NULL
  THEN
    -- read config from app_settings (Supabase blocks ALTER DATABASE SET app.*)
    SELECT value INTO v_url    FROM public.app_settings WHERE key = 'refund_url';
    SELECT value INTO v_secret FROM public.app_settings WHERE key = 'refund_secret';

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
      RAISE WARNING '[refund-trigger] refund_url / refund_secret missing in app_settings — refund NOT fired for %', v_moid;
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
$function$;

-- Trigger binding intentionally NOT re-created here — trg_refund_on_owner_reject
-- from 20260728 is already correct, enabled, and unaffected by replacing the
-- function body.

COMMIT;
