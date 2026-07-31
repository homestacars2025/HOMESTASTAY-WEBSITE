'use server';

import { Resend } from 'resend';
import { CONTACT_EMAIL } from '@/lib/config/social';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContactFormData = {
  name: string;
  email: string;
  subject: string;
  message: string;
  locale: string;
  _honey?: string;
};

export type ContactResult =
  | { ok: true }
  | { ok: false; error: 'required' | 'emailInvalid' | 'generic' };

// ── Action ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContact(data: ContactFormData): Promise<ContactResult> {
  // Honeypot: a bot filled the hidden field — silently succeed
  if (data._honey) return { ok: true };

  const name    = data.name.trim();
  const email   = data.email.trim().toLowerCase();
  const subject = data.subject.trim();
  const message = data.message.trim();

  if (!name || !email || !message) return { ok: false, error: 'required' };
  if (!EMAIL_RE.test(email))        return { ok: false, error: 'emailInvalid' };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[contactForm] RESEND_API_KEY not set — skipping email');
    return { ok: false, error: 'generic' };
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from:    'noreply@homestastay.com',
      to:      CONTACT_EMAIL,
      replyTo: email,
      subject: subject ? `Contact: ${subject}` : `Contact message from ${name}`,
      html:    buildHtml({ name, email, subject, message, locale: data.locale }),
    });
    return { ok: true };
  } catch (err) {
    console.error('[contactForm] Email send error:', err);
    return { ok: false, error: 'generic' };
  }
}

// ── Email template ─────────────────────────────────────────────────────────────

function buildHtml(p: {
  name: string; email: string; subject: string; message: string; locale: string;
}): string {
  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:8px 0;color:#8C8881;font-size:14px;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:500;color:#0E0E10;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#F2EEE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #E2DED4;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#8C8881;">Contact form — homestastay.com</p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:500;color:#0E0E10;letter-spacing:-0.03em;">${escHtml(p.name)}</h1>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E2DED4;">
      ${row('Name',    escHtml(p.name))}
      ${row('Email',   `<a href="mailto:${escHtml(p.email)}" style="color:#E52851;">${escHtml(p.email)}</a>`)}
      ${p.subject ? row('Subject', escHtml(p.subject)) : ''}
      ${row('Message', escHtml(p.message).replace(/\n/g, '<br>'))}
      ${row('Locale',  escHtml(p.locale))}
    </table>
    <p style="margin:24px 0 0;font-size:12px;color:#8C8881;">Submitted via homestastay.com — contact form</p>
  </div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
