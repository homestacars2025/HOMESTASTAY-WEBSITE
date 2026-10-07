'use server';

import { after } from 'next/server';
import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/lib/config/social';
import { createClient } from '@/lib/supabase/server';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * The host application. No email field: the application belongs to the
 * signed-in account, and the account's verified email is the contact address.
 */
export type HostFormData = {
  name:          string;
  phone:         string;
  unitType:      string;
  unitsCount:    number;
  city:          string;
  district:      string;
  contactMethod: string;
  note:          string;
  listingLink:   string;
};

export type SubmitResult =
  | { ok: true;  status: 'under_review' | 'already_host'; name: string }
  | { ok: false; error: 'signin' | 'required' | 'phoneInvalid' | 'unitsMin' | 'generic' };

const VALID_UNIT_TYPES  = new Set(['apartment', 'villa', 'cabin', 'hotel', 'farm']);
const VALID_CONTACTS    = new Set(['whatsapp', 'phone', 'email']);

// ── Action ────────────────────────────────────────────────────────────────────

/**
 * "Become a host" — an application on the SAME account.
 *
 * Calls submit_host_application() as the signed-in user (session client, RLS
 * and auth.uid() apply): the database binds the lead to the account, keeps one
 * open application per account (re-submitting updates it), and refuses anyone
 * who is not a signed-in customer. Nothing is inserted with the service role
 * any more. The team approves in their own tools, which turns this same
 * account into an owner — sign-in then routes it to the host portal.
 */
export async function submitHostApplication(data: HostFormData): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'signin' };

  // Server-side validation (defence in depth)
  const name     = data.name.trim();
  const city     = data.city.trim();
  const district = data.district.trim();
  const note     = data.note.trim();
  const link     = data.listingLink.trim();
  const phone    = data.phone.trim();

  if (!name || !phone || !data.unitType || !city || !data.contactMethod) {
    return { ok: false, error: 'required' };
  }
  if (!phone.startsWith('+') || phone.replace(/\D/g, '').length < 7) {
    return { ok: false, error: 'phoneInvalid' };
  }
  if (!VALID_UNIT_TYPES.has(data.unitType))    return { ok: false, error: 'required' };
  if (!VALID_CONTACTS.has(data.contactMethod)) return { ok: false, error: 'required' };
  if (!Number.isInteger(data.unitsCount) || data.unitsCount < 1) return { ok: false, error: 'unitsMin' };

  const { data: result, error } = await supabase.rpc('submit_host_application', {
    p_contact_name:      name.slice(0, 120),
    p_phone:             phone,
    p_property_type:     data.unitType,
    p_units_count:       data.unitsCount,
    p_city:              city.slice(0, 120),
    p_district:          district.slice(0, 120) || null,
    p_company_name:      null,
    p_preferred_contact: data.contactMethod,
    p_listing_url:       link.slice(0, 500) || null,
    p_note:              note.slice(0, 2000) || null,
  });

  if (error) {
    console.error('[hostForm] submit_host_application failed', { code: error.code, message: error.message });
    return { ok: false, error: 'generic' };
  }

  const row = (Array.isArray(result) ? result[0] : result) as
    | { status?: string; lead_id?: string; updated?: boolean }
    | null;
  const status = row?.status === 'already_host' ? 'already_host' : 'under_review';

  // The team's heads-up, after the response — a slow email must not hold the
  // guest's screen, and after() survives the function returning (a bare
  // promise did not).
  if (status === 'under_review') {
    const email = user.email ?? '';
    after(() => sendNotificationEmail({
      name, phone, email, data, city, district, note, link,
      leadId: row?.lead_id ?? null, updated: row?.updated === true,
    }));
  }

  return { ok: true, status, name };
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
  name, phone, email, data, city, district, note, link, leadId, updated,
}: {
  leadId:   string | null;
  updated:  boolean;
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
    <p style="margin:0 0 4px;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#8C8881;">${updated ? 'Host application updated' : 'New Host Application'}</p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:500;color:#0E0E10;letter-spacing:-0.03em;">${escHtml(name)}</h1>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E2DED4;">
      ${row('Full name',         escHtml(name))}
      ${row('Phone',             escHtml(phone))}
      ${row('Email',             escHtml(email))}
      ${row('Unit type',         UNIT_TYPE_LABELS[data.unitType] ?? data.unitType)}
      ${row('Number of units',   String(data.unitsCount))}
      ${row('City',              escHtml(city))}
      ${district ? row('District', escHtml(district)) : ''}
      ${row('Preferred contact', CONTACT_LABELS[data.contactMethod] ?? data.contactMethod)}
      ${note ? row('Note', escHtml(note).replace(/\n/g, '<br>')) : ''}
      ${leadId ? row('Lead id', escHtml(leadId)) : ''}
      ${link ? row('Listing link', `<a href="${escHtml(link)}" style="color:#E52851;">${escHtml(link)}</a>`) : ''}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#8C8881;">Submitted via homestastay.com — host application form</p>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from:    'noreply@homestastay.com',
      to:      CONTACT_EMAIL,
      subject: `${updated ? 'Host application updated' : 'New host application'} — ${name}`,
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
