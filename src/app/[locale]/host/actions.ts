'use server';

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/lib/config/social';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HostFormData = {
  name:          string;
  phone:         string;
  email:         string;
  unitType:      string;
  unitsCount:    number;
  city:          string;
  district:      string;
  contactMethod: string;
  note:          string;
  listingLink:   string;
};

export type SubmitResult =
  | { ok: true;  name: string }
  | { ok: false; error: 'required' | 'emailInvalid' | 'phoneInvalid' | 'unitsMin' | 'generic' };

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_UNIT_TYPES  = new Set(['apartment', 'villa', 'cabin', 'hotel', 'farm']);
const VALID_CONTACTS    = new Set(['whatsapp', 'phone', 'email']);
const EMAIL_RE          = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function submitHostApplication(data: HostFormData): Promise<SubmitResult> {
  // Server-side validation (defence in depth)
  const name     = data.name.trim();
  const email    = data.email.trim().toLowerCase();
  const city     = data.city.trim();
  const district = data.district.trim();
  const note     = data.note.trim();
  const link     = data.listingLink.trim();
  const phone    = data.phone.trim();

  if (!name || !phone || !email || !data.unitType || !city || !data.contactMethod) {
    return { ok: false, error: 'required' };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'emailInvalid' };
  if (!phone.startsWith('+') || phone.replace(/\D/g, '').length < 7) {
    return { ok: false, error: 'phoneInvalid' };
  }
  if (!VALID_UNIT_TYPES.has(data.unitType))    return { ok: false, error: 'required' };
  if (!VALID_CONTACTS.has(data.contactMethod)) return { ok: false, error: 'required' };
  if (data.unitsCount < 1) return { ok: false, error: 'unitsMin' };

  // ── Map to DB columns ──────────────────────────────────────────────────────
  // 'farm' has no enum value → map to 'other' + supplier_type_other
  const supplierType      = data.unitType === 'farm' ? 'other' : data.unitType;
  const supplierTypeOther = data.unitType === 'farm' ? 'farm'  : null;

  // Compose structured notes block
  const noteLines: string[] = [`Preferred contact: ${data.contactMethod}`];
  if (district) noteLines.push(`District: ${district}`);
  if (note)     noteLines.push(`Note: ${note}`);
  if (link)     noteLines.push(`Listing: ${link}`);
  const notes = noteLines.join('\n');

  // Copy phone to whatsapp_number when that's the preferred contact
  const whatsappNumber = data.contactMethod === 'whatsapp' ? phone : null;

  // Unique slug — no DB sequence needed
  const slug = `host-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // ── DB insert ──────────────────────────────────────────────────────────────
  const supabase = serviceClient();
  const { error: dbError } = await supabase.from('leads_suppliers').insert({
    slug,
    contact_name:         name,
    phone,
    email,
    supplier_type:        supplierType,
    supplier_type_other:  supplierTypeOther,
    units_count:          data.unitsCount,
    district:             city,
    source:               'website',
    // stage / priority have DB defaults ('new' / 'medium') — omit to use them
    notes,
    whatsapp_number:      whatsappNumber,
    tags:                 [`preferred_contact:${data.contactMethod}`],
  });

  if (dbError) {
    console.error('[hostForm] DB insert error:', dbError);
    return { ok: false, error: 'generic' };
  }

  // ── Email notification (fire-and-forget) ────────────────────────────────────
  void sendNotificationEmail({ name, phone, email, data, city, district, note, link });

  return { ok: true, name };
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
  name, phone, email, data, city, district, note, link,
}: {
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
      ${row('Email',             escHtml(email))}
      ${row('Unit type',         UNIT_TYPE_LABELS[data.unitType] ?? data.unitType)}
      ${row('Number of units',   String(data.unitsCount))}
      ${row('City',              escHtml(city))}
      ${district ? row('District', escHtml(district)) : ''}
      ${row('Preferred contact', CONTACT_LABELS[data.contactMethod] ?? data.contactMethod)}
      ${note ? row('Note', escHtml(note).replace(/\n/g, '<br>')) : ''}
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
