import { NextResponse } from 'next/server';

/**
 * POST /api/app/host/handoff — RETIRED as a way in.
 *
 * Opening the host portal now needs the email code first, so the handoff URL
 * is only ever returned by POST /api/app/host/step-up/verify, after a correct
 * code. This endpoint stays so an older app build gets a clear, actionable
 * answer instead of a 404: 403 step_up_required → run start, then verify.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: false, error: 'step_up_required' }, { status: 403 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
