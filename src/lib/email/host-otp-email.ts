import 'server-only';
import { Resend } from 'resend';
import { SOCIAL_LINKS } from '@/lib/config/social';

/**
 * "Your Homesta sign-in code" — the host portal's second step.
 *
 * English first, with short Arabic and Turkish lines: hosts are in Türkiye and
 * Libya, and the email is read before they are back on the site. White,
 * branded like the password email: the Homesta mark, the code large in a
 * block, no button — there is nothing to click, only six digits to type.
 *
 * The code is passed in and placed in the HTML; it is never logged here or
 * anywhere else. Returns false (and logs WHY, without the code) when the
 * email could not be handed to Resend.
 */
export async function sendHostOtpEmail({ to, code, locale }: { to: string; code: string; locale: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[host-otp-email] RESEND_API_KEY not set — cannot send');
    return false;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: 'Homesta Stay <noreply@homestastay.com>',
      to,
      subject: 'Your Homesta sign-in code',
      html: html(code, locale),
      text: text(code, locale),
    });
    if (error) {
      console.error('[host-otp-email] Resend refused the email', { name: error.name, message: error.message });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[host-otp-email] send failed', { error: err instanceof Error ? err.message : 'unknown' });
    return false;
  }
}

const SITE = 'https://www.homestastay.com';
const href = (key: 'instagram' | 'facebook') => SOCIAL_LINKS.find((l) => l.key === key)?.href ?? SITE;

function resetUrl(locale: string): string {
  const l = ['en', 'ar', 'tr', 'ru'].includes(locale) ? locale : 'en';
  return `${SITE}/${l}/forgot-password`;
}

function text(code: string, locale: string): string {
  return [
    'Your Homesta sign-in code',
    '',
    code,
    '',
    'Enter this code to finish signing in to the Homesta host portal. It is valid for 10 minutes.',
    `If this wasn't you, change your password: ${resetUrl(locale)}`,
    '',
    'رمز الدخول إلى بوابة المضيفين في Homesta — صالح لمدة 10 دقائق.',
    'Homesta ev sahibi portalı giriş kodunuz — 10 dakika geçerlidir.',
    '',
    `Instagram: ${href('instagram')} · Facebook: ${href('facebook')} · ${SITE}`,
  ].join('\n');
}

function html(code: string, locale: string): string {
  const reset = resetUrl(locale);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Your Homesta sign-in code</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#FFFFFF;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;">
        <tr>
          <td style="background-color:#FFFFFF;border:1px solid #E2DED4;border-radius:14px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">

              <!-- Mark -->
              <tr>
                <td align="center" style="padding:40px 40px 24px;">
                  <div style="display:inline-block;width:40px;height:40px;border-top:6px solid #E52851;border-left:6px solid #E52851;border-right:6px solid #E52851;border-bottom:0;border-radius:20px 20px 0 0;box-sizing:border-box;font-size:0;line-height:40px;">&#8203;</div>
                  <p style="margin:10px 0 0;font-size:24px;font-weight:700;letter-spacing:-1px;color:#0E0E10;line-height:1;">homesta</p>
                  <p style="margin:5px 0 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:0.38em;text-transform:uppercase;color:#E52851;line-height:1;">&#8202;&#8202;— STAY</p>
                </td>
              </tr>

              <!-- English -->
              <tr>
                <td dir="ltr" style="padding:8px 40px 8px;text-align:left;">
                  <p style="margin:0 0 10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.13em;text-transform:uppercase;color:#8C8881;">Host portal sign-in</p>
                  <p style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:-0.4px;line-height:1.25;color:#0E0E10;">Your Homesta sign-in code</p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#45454B;">Enter this code to finish signing in to the host portal. It is valid for <strong style="color:#0E0E10;">10 minutes</strong>.</p>
                </td>
              </tr>

              <!-- Code -->
              <tr>
                <td align="center" style="padding:0 40px 24px;">
                  <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                    <tr>
                      <td align="center" style="padding:18px 28px;background-color:#0E0E10;border-radius:12px;">
                        <p dir="ltr" style="margin:0;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:0.32em;color:#FFFFFF;line-height:1;">${code}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td dir="ltr" style="padding:0 40px 24px;text-align:left;">
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#45454B;">If this wasn&#8217;t you, someone may know your password &#8212; <a href="${reset}" style="color:#E52851;font-weight:600;text-decoration:underline;">change your password</a>. Never share this code with anyone; Homesta will never ask for it.</p>
                </td>
              </tr>

              <!-- Arabic / Turkish -->
              <tr>
                <td style="padding:0 40px 28px;">
                  <p dir="rtl" style="margin:0 0 6px;font-size:13px;line-height:1.7;color:#45454B;text-align:right;">هذا رمز الدخول إلى بوابة المضيفين في Homesta، صالح لمدة 10 دقائق. إن لم تكن أنت، غيّر كلمة المرور فوراً.</p>
                  <p dir="ltr" style="margin:0;font-size:13px;line-height:1.7;color:#45454B;text-align:left;">Bu, Homesta ev sahibi portalı giriş kodunuzdur ve 10 dakika geçerlidir. Siz değilseniz şifrenizi hemen değiştirin.</p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:0;"><div style="height:1px;background-color:#E2DED4;font-size:0;line-height:0;">&#8203;</div></td>
              </tr>
              <tr>
                <td align="center" style="padding:20px 40px 26px;">
                  <p style="margin:0;font-size:12px;color:#8C8881;line-height:1.6;">
                    <a href="${href('instagram')}" style="color:#8C8881;text-decoration:none;">Instagram</a> &#183;
                    <a href="${href('facebook')}" style="color:#8C8881;text-decoration:none;">Facebook</a> &#183;
                    <a href="${SITE}" style="color:#8C8881;text-decoration:none;">homestastay.com</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
