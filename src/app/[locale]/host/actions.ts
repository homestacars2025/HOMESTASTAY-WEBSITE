'use server';

import { after } from 'next/server';
import { headers } from 'next/headers';
import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/lib/config/social';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { allow, clientIp, ipForLog } from '@/lib/security/rate-limit';
import { TURNSTILE_ACTION_HOST_LEAD, verifyTurnstile } from '@/lib/security/turnstile';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The public "List your property" form. No account needed — anyone can send
 * it. City / district travel as geo ids (the server resolves the names), the
 * district as free text only when it isn't in the list.
 */
export type HostFormData = {
  name:           string;
  phone:          string;
  email:          string;
  unitType:       string;
  unitsCount:     number;
  cityId:         string;
  /** A geo_districts id, or '' (none / typed by hand). */
  districtId:     string;
  districtManual: string;
  contactMethod:  string;
  note:           string;
  listingLink:    string;
  captchaToken:   string | null;
  /** Honeypot — hidden from people; a bot that fills it gets a fake success. */
  website:        string;
};

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'required' | 'emailInvalid' | 'phoneInvalid' | 'unitsMin' | 'captcha' | 'rateLimited' | 'generic' };

const VALID_UNIT_TYPES = new Set(['apartment', 'villa', 'cabin', 'hotel', 'farm']);
const VALID_CONTACTS   = new Set(['whatsapp', 'phone', 'email']);
const EMAIL_RE         = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE          = /^\+[1-9][0-9]{6,14}$/;
const UUID_RE          = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR             = 60 * 60 * 1000;

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * Inserts the lead into leads_suppliers with the service role (source
 * 'website', stage / priority from their DB defaults). The database notifies
 * the team (Hosts CRM + admin) for every website lead on its own.
 *
 * A signed-in visitor's lead is also linked to their account
 * (applicant_profile_id), so the account-linked flow — "Application under
 * review", approval turning the account into a host — keeps working.
 *
 * Guards: honeypot, Cloudflare Turnstile, 5 sends / hour per IP (in memory,
 * per instance — see rate-limit.ts).
 */
export async function submitHostApplication(data: HostFormData): Promise<SubmitResult> {
  const ip = clientIp(await headers());

  if (typeof data.website === 'string' && data.website.trim() !== '') {
    console.warn('[hostForm] honeypot filled — dropped', { ip: ipForLog(ip) });
    return { ok: true };
  }

  // Server-side validation (defence in depth)
  const name     = str(data.name).trim().slice(0, 120);
  const phone    = str(data.phone).trim();
  const email    = str(data.email).trim().toLowerCase().slice(0, 200);
  const note     = str(data.note).trim().slice(0, 2000);
  const link     = str(data.listingLink).trim().slice(0, 500);
  const typed    = str(data.districtManual).trim().slice(0, 120);
  const units    = Number(data.unitsCount);

  if (!name || !phone || !data.unitType || !UUID_RE.test(str(data.cityId)) || !data.contactMethod) {
    return { ok: false, error: 'required' };
  }
  if (!E164_RE.test(phone)) return { ok: false, error: 'phoneInvalid' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'emailInvalid' };
  if (!VALID_UNIT_TYPES.has(data.unitType))    return { ok: false, error: 'required' };
  if (!VALID_CONTACTS.has(data.contactMethod)) return { ok: false, error: 'required' };
  if (!Number.isInteger(units) || units < 1 || units > 10_000) return { ok: false, error: 'unitsMin' };

  if (!allow(`host-lead:${ip}`, 5, HOUR)) {
    console.warn('[hostForm] rate limited', { ip: ipForLog(ip) });
    return { ok: false, error: 'rateLimited' };
  }
  if (!(await verifyTurnstile(data.captchaToken, ip, TURNSTILE_ACTION_HOST_LEAD))) {
    return { ok: false, error: 'captcha' };
  }

  const admin = createAdminClient();

  // City → city_id (+ its country), district → district_id + its name. The
  // district must belong to the city; a typed district is kept as text.
  const { data: city } = await admin
    .from('geo_cities').select('id, name, country_id').eq('id', data.cityId).maybeSingle();
  if (!city) return { ok: false, error: 'required' };

  let district: { id: string; name: string } | null = null;
  if (UUID_RE.test(str(data.districtId))) {
    const { data: d } = await admin
      .from('geo_districts').select('id, name').eq('id', data.districtId).eq('city_id', city.id).maybeSingle();
    district = d ?? null;
  }
  const districtName = district?.name ?? typed;

  // Signed in? Link the lead to the account (the visitor never chooses this).
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();

  // 'farm' has no supplier_type value → 'other' + supplier_type_other
  const supplierType      = data.unitType === 'farm' ? 'other' : data.unitType;
  const supplierTypeOther = data.unitType === 'farm' ? 'farm'  : null;

  const noteLines: string[] = [`Preferred contact: ${data.contactMethod}`];
  if (note) noteLines.push(`Note: ${note}`);
  if (link) noteLines.push(`Listing: ${link}`);

  const { data: lead, error } = await admin
    .from('leads_suppliers')
    .insert({
      slug:                 `host-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      contact_name:         name,
      phone,
      email:                email || (user?.email ?? null),
      supplier_type:        supplierType,
      supplier_type_other:  supplierTypeOther,
      units_count:          units,
      country_id:           city.country_id ?? null,
      city_id:              city.id,
      district_id:          district?.id ?? null,
      district:             districtName || null,
      source:               'website',
      // stage / priority: DB defaults ('new' / 'medium')
      notes:                noteLines.join('\n'),
      whatsapp_number:      data.contactMethod === 'whatsapp' ? phone : null,
      tags:                 [`preferred_contact:${data.contactMethod}`],
      applicant_profile_id: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error || !lead) {
    console.error('[hostForm] insert failed', { code: error?.code, message: error?.message });
    return { ok: false, error: 'generic' };
  }

  // The team's email, after the response — a slow email must not hold the
  // visitor's screen, and after() survives the function returning.
  after(() => sendNotificationEmail({
    name, phone, email: email || (user?.email ?? ''), data,
    city: city.name, district: districtName, note, link, leadId: lead.id, signedIn: !!user,
  }));

  return { ok: true };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// ── Email ─────────────────────────────────────────────────────────────────────

const UNIT_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  villa:     'Villa',
  cabin:     'Cabin',
  hotel:     'Hotel',
  farm:      'Farm',
};
const CONTACT_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  phone:    'Phone call',
  email:    'Email',
};

async function sendNotificationEmail({
  name, phone, email, data, city, district, note, link, leadId, signedIn,
}: {
  leadId:   string;
  signedIn: boolean;
  name:     string;
  phone:    string;
  email:    string;
  data:     HostFormData;
  city:     string;
  district: string;
  note:     string;
  link:     string;
}) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[hostForm] RESEND_API_KEY not set — skipping email'); return; }

    const resend = new Resend(apiKey);

    const row = (label: string, value: string) => `
      <tr>
        <td style="padding:8px 0;color:#8C8881;font-size:14px;width:44%;vertical-align:top;">${label}</td>
        <td style="padding:8px 0;font-size:14px;font-weight:500;color:#0E0E10;">${value}</td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#F2EEE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #E2DED4;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#8C8881;">New Host Application</p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:500;color:#0E0E10;letter-spacing:-0.03em;">${escHtml(name)}</h1>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E2DED4;">
      ${row('Full name',         escHtml(name))}
      ${row('Phone',             escHtml(phone))}
      ${email ? row('Email', escHtml(email)) : ''}
      ${row('Unit type',         UNIT_TYPE_LABELS[data.unitType] ?? data.unitType)}
      ${row('Number of units',   String(data.unitsCount))}
      ${row('City',              escHtml(city))}
      ${district ? row('District', escHtml(district)) : ''}
      ${row('Preferred contact', CONTACT_LABELS[data.contactMethod] ?? data.contactMethod)}
      ${note ? row('Note', escHtml(note).replace(/\n/g, '<br>')) : ''}
      ${row('Lead id', escHtml(leadId))}
      ${signedIn ? row('Account', 'Signed in — linked to their account') : ''}
      ${link ? row('Listing link', `<a href="${escHtml(link)}" style="color:#E52851;">${escHtml(link)}</a>`) : ''}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#8C8881;">Submitted via homestastay.com — host application form</p>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from:    'noreply@homestastay.com',
      to:      CONTACT_EMAIL,
      subject: `New host application — ${name}`,
      html,
    });
  } catch (err) {
    // Email failure must never block the lead
    console.error('[hostForm] Email send error:', err);
  }
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
