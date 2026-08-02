import 'server-only';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { createElement, type ReactElement } from 'react';
import { LegalDocumentPdf, type LegalAnnexRow } from '@/lib/pdf/legal-document-pdf';
import { getLegalDoc } from '@/content/legal';
import { DOCUMENT_VERSION } from '@/lib/booking/documents';

/**
 * The paid-booking confirmation email.
 *
 * Mesafeli Satış Sözleşmesi Madde 8 requires BOTH documents to be sent to the
 * guest as PDF after payment, so this attaches:
 *   - Ön Bilgilendirme Formu (with the booking summary as its legal annex)
 *   - Mesafeli Satış Sözleşmesi
 * in Turkish — the legally operative version, regardless of the guest's UI
 * language. The email body is bilingual TR/EN, because the callback that
 * triggers this is a cross-site POST with no locale (see the route comment).
 *
 * Fired via `after()` from the callback, so a slow PDF render never delays the
 * guest's redirect. It must never throw into that path: an email failure is
 * logged, not surfaced, because the booking is already paid and valid.
 *
 * DELIBERATELY NOT the WhatsApp owner prompt. That is a DB trigger
 * (trg_notify_booking_paid); this is guest-facing and lives in the app.
 */

export interface BookingConfirmationData {
  reference:      string;
  email:          string;
  checkIn:        string;   // YYYY-MM-DD
  checkOut:       string;
  guests:         number;
  totalUsd:       number | null;
  amountChargedTry: number | null;
  /** Absent means Kuveyt — the original path, unchanged in every respect. */
  gateway?:         'kuveyt' | 'tlync';
  /** TLYNC only: what the guest actually paid, in Libyan dinar. */
  amountChargedLyd?: number | null;
}

/** "59.924,37 TL" — never the ₺ glyph: Geist has no glyph for it (tofu in PDF). */
function formatTry(amount: number): string {
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)} TL`;
}

/** "1.234,56 LYD" — spelled out for the same reason as TL: no glyph, no tofu. */
function formatLyd(amount: number): string {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)} LYD`;
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${iso}T00:00:00Z`));
}

async function renderDocumentPdf(
  slug: 'on-bilgilendirme' | 'mesafeli-satis',
  annex?: LegalAnnexRow[],
): Promise<Buffer> {
  // 'tr' is always available — it is the operative text, never a fallback.
  const { content } = getLegalDoc(slug, 'tr');
  // LegalDocumentPdf returns a <Document>, but createElement types the element
  // by the component's own props. renderToBuffer wants ReactElement<DocumentProps>.
  const element = createElement(LegalDocumentPdf, {
    content,
    version: DOCUMENT_VERSION,
    versionLabel: 'Belge sürümü',
    footerNote: 'Homesta Stay — homestastay.com',
    annex,
  }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

export async function sendBookingConfirmation(
  data: BookingConfirmationData,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[confirmation-email] RESEND_API_KEY not set — cannot send', {
      reference: data.reference,
    });
    return;
  }

  try {
    // The booking summary is the Ön Bilgilendirme Formu's annex (EK-1).
    const annex: LegalAnnexRow[] = [
      { label: 'Rezervasyon numarası', value: data.reference },
      { label: 'Giriş',  value: formatDate(data.checkIn) },
      { label: 'Çıkış',  value: formatDate(data.checkOut) },
      { label: 'Misafir', value: String(data.guests) },
    ];
    // A TLYNC guest paid in dinar and never in lira, so the lira figure — the
    // booking's internal reference amount — must not be presented to them as
    // "the amount charged".
    const chargedLyd =
      data.gateway === 'tlync' && data.amountChargedLyd != null
        ? data.amountChargedLyd
        : null;

    if (chargedLyd !== null) {
      annex.push({ label: 'Tahsil edilen tutar', value: formatLyd(chargedLyd) });
    } else if (data.amountChargedTry !== null) {
      annex.push({ label: 'Tahsil edilen tutar', value: formatTry(data.amountChargedTry) });
    }
    if (data.totalUsd !== null) {
      annex.push({ label: 'ABD doları karşılığı', value: formatUsd(data.totalUsd) });
    }

    const [preInfoPdf, contractPdf] = await Promise.all([
      renderDocumentPdf('on-bilgilendirme', annex),
      renderDocumentPdf('mesafeli-satis'),
    ]);

    const resend = new Resend(apiKey);

    const amountLine =
      chargedLyd !== null
        ? formatLyd(chargedLyd) +
          (data.totalUsd !== null ? ` (${formatUsd(data.totalUsd)})` : '')
        : data.amountChargedTry !== null
        ? formatTry(data.amountChargedTry) +
          (data.totalUsd !== null ? ` (${formatUsd(data.totalUsd)})` : '')
        : data.totalUsd !== null ? formatUsd(data.totalUsd) : '';

    await resend.emails.send({
      from: 'Homesta Stay <noreply@homestastay.com>',
      to: data.email,
      subject: `Ödeme alındı — ${data.reference} · Payment received`,
      html: confirmationHtml(data, amountLine),
      attachments: [
        { filename: `On-Bilgilendirme-Formu-${data.reference}.pdf`, content: preInfoPdf },
        { filename: `Mesafeli-Satis-Sozlesmesi-${data.reference}.pdf`, content: contractPdf },
      ],
    });
  } catch (err) {
    // The booking is paid and valid; a missing confirmation email is a
    // follow-up task, not a failure to bubble into the payment path.
    console.error('[confirmation-email] send failed', {
      reference: data.reference,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Bilingual TR/EN — Turkish first, since the jurisdiction and the attached
 * documents are Turkish. Never claims the stay is confirmed: it says payment
 * was received and the owner has 12 hours, mirroring the result page.
 */
function confirmationHtml(data: BookingConfirmationData, amountLine: string): string {
  const ref = esc(data.reference);
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 16px;background:#F2EEE6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #E2DED4;">
    <p style="margin:0 0 4px;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#8C8881;">Homesta Stay</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0E0E10;letter-spacing:-0.02em;">${ref}</h1>

    <p style="margin:0 0 16px;font-size:15px;color:#45454B;line-height:1.6;">
      Ödemeniz alındı. Rezervasyon talebiniz mülk sahibine iletildi; en geç <strong>12 saat</strong> içinde onaylandığında size tekrar e-posta göndereceğiz. Bu aşamada konaklamanız henüz kesinleşmemiştir.
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#8C8881;line-height:1.6;">
      Payment received. Your request has been sent to the property owner, who has up to <strong>12 hours</strong> to approve — we’ll email you again once they do. Your stay is not yet confirmed.
    </p>

    ${amountLine ? `<div style="border:1px solid #E2DED4;border-radius:10px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8C8881;">Tahsil edilen · Charged</p>
      <p style="margin:0;font-size:20px;font-weight:600;color:#0E0E10;">${esc(amountLine)}</p>
    </div>` : ''}

    ${data.gateway === 'tlync'
      ? `<p style="margin:0 0 6px;font-size:13px;color:#45454B;line-height:1.6;">
      Onaylanmazsa ödemenizin tamamı, ödeme yaptığınız Libya kanalı üzerinden ekibimiz tarafından iade edilir. İade için sizinle iletişime geçeceğiz.
    </p>
    <p style="margin:0 0 20px;font-size:12px;color:#8C8881;line-height:1.6;">
      If not approved, you’re refunded in full through the same Libyan payment channel. Our team processes this by hand and will contact you to complete it.
    </p>`
      : `<p style="margin:0 0 6px;font-size:13px;color:#45454B;line-height:1.6;">
      Onaylanmazsa ödemenizin tamamı aynı kartınıza iade edilir (3–10 iş günü).
    </p>
    <p style="margin:0 0 20px;font-size:12px;color:#8C8881;line-height:1.6;">
      If not approved, you’re refunded in full to the same card (3–10 business days).
    </p>`}

    <p style="margin:0;font-size:12px;color:#8C8881;line-height:1.6;">
      Ekte Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi PDF olarak yer almaktadır. · The Pre-Information Form and Distance Sales Contract are attached as PDFs.
    </p>
  </div>
</body>
</html>`;
}
