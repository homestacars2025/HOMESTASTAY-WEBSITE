-- ═══════════════════════════════════════════════════════════════════════════
-- Capture expire_unanswered_paid_bookings() into the repo — Homesta Stay
-- (project djtpksherrayzxmunvkv)
--
-- WHY THIS MIGRATION EXISTS
-- This timeout sweep was built directly in the DB and existed nowhere in the
-- repo. It is load-bearing: it is the ONLY thing that auto-rejects a paid
-- 'hold' booking whose owner never answered, and that 'rejected' transition is
-- what trips trg_refund_on_owner_reject → pg_net → /api/payment/refund. Without
-- it, timed-out paid bookings would never be refunded. Capturing it here means a
-- migrate-from-scratch / rollback reproduces reality instead of silently
-- dropping the sweep.
--
-- The function body below is byte-for-byte the live definition
-- (pg_get_functiondef). Idempotent: CREATE OR REPLACE FUNCTION — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_unanswered_paid_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n integer;
BEGIN
  WITH expired AS (
    UPDATE public.bookings b
       SET owner_decision   = 'rejected',
           owner_decided_at = now(),
           cancelled_reason = COALESCE(b.cancelled_reason,
                              'Owner did not respond within decision window (auto)')
     WHERE b.status = 'hold'
       AND b.paid_at IS NOT NULL
       AND b.owner_decision IS NULL
       AND b.owner_decision_due_at IS NOT NULL
       AND b.owner_decision_due_at <= now()
     RETURNING 1
  )
  SELECT count(*) INTO n FROM expired;

  IF n > 0 THEN
    RAISE LOG 'expire_unanswered_paid_bookings: auto-rejected % unanswered paid booking(s)', n;
  END IF;
  RETURN n;
END;
$function$;

-- ── Cron schedule (mirrors prod jobid 8: '*/15 * * * *') ────────────────────
-- Duplicate-safe & environment-safe: only schedules when pg_cron is installed
-- AND no job already runs this command. Applying to the existing prod DB is a
-- no-op (its current job is preserved, NOT duplicated); a fresh environment gets
-- the schedule automatically. If pg_cron is absent, it is skipped with a notice.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE command ILIKE '%expire_unanswered_paid_bookings%'
    ) THEN
      PERFORM cron.schedule(
        'expire-unanswered-paid-bookings',
        '*/15 * * * *',
        $cmd$SELECT public.expire_unanswered_paid_bookings();$cmd$
      );
    END IF;
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping schedule for expire_unanswered_paid_bookings; schedule it manually';
  END IF;
END
$$;

COMMIT;
