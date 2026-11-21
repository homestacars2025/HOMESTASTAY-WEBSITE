import { createTranslator } from 'next-intl';
import { createPublicClient } from '@/lib/supabase/public';
import { getTransferOptions } from '@/lib/transfers/server';
import { formatIstanbul, localName, num, parseTransfer, str, statusKey } from '@/lib/transfers/model';
import { updateDriverStatus } from './actions';

/**
 * The driver's page — transfer.homestastay.com/d/[token] (middleware rewrites
 * it to /driver/[lang]/[token]). No login: the token in the WhatsApp message
 * is the credential, read by transfer_driver_view (anon).
 *
 * Turkish first; TR / EN / AR / RU switch. One big button for the next step
 * (en_route → arrived → picked_up → completed; "no show" only once arrived).
 * No client JavaScript at all: plain forms (server actions) and links, so it
 * works on a slow connection. Customer phone and WhatsApp, flight status,
 * Google Maps navigation.
 */

export const dynamic = 'force-dynamic';

const LANGS = ['tr', 'en', 'ar', 'ru'] as const;
type Lang = (typeof LANGS)[number];

/** The next step(s) the driver may report, by current status. */
function nextSteps(status: string): string[] {
  switch (statusKey(status)) {
    case 'paid': case 'unassigned': case 'offered': case 'assigned': return ['en_route'];
    case 'en_route': return ['arrived'];
    case 'arrived': return ['picked_up', 'no_show'];
    case 'picked_up': return ['completed'];
    default: return [];
  }
}

const mapsDir = (destination: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

export default async function DriverPage({
  params, searchParams,
}: {
  params: Promise<{ lang: string; token: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { lang: rawLang, token } = await params;
  const { e } = await searchParams;
  const lang: Lang = (LANGS as readonly string[]).includes(rawLang) ? (rawLang as Lang) : 'tr';
  const messages = (await import(`../../../../../messages/${lang}.json`)).default;
  const t = createTranslator({ locale: lang, messages, namespace: 'driver' });

  const { data, error } = /^[A-Za-z0-9_-]{8,200}$/.test(token)
    ? await createPublicClient().rpc('transfer_driver_view', { p_token: token })
    : { data: { status: 'invalid_link' }, error: null };
  if (error) console.error('[driver] transfer_driver_view failed', { code: error.code, message: error.message });
  const raw = ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;
  const answer = str(raw.status);

  const langSwitch = (
    <nav aria-label="Language" className="flex gap-1.5">
      {LANGS.map((l) => (
        <a key={l} href={`/d/${encodeURIComponent(token)}?lang=${l}`} aria-current={l === lang ? 'true' : undefined}
          className={`min-h-11 min-w-11 rounded-full px-3 py-2.5 text-center text-sm font-medium ${l === lang ? 'bg-ink text-white' : 'border border-rule text-ink'}`}>
          {l.toUpperCase()}
        </a>
      ))}
    </nav>
  );

  if (error || answer === 'invalid_link' || answer === 'not_active') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-6">
        {langSwitch}
        <h1 className="text-2xl font-medium">{t(answer === 'not_active' ? 'notActiveTitle' : 'invalidTitle')}</h1>
        <p className="text-ink-soft">{t(answer === 'not_active' ? 'notActiveBody' : 'invalidBody')}</p>
      </main>
    );
  }

  const src = ((raw.transfer as Record<string, unknown> | undefined) ?? raw);
  // The driver view may not carry an id — the parser needs one, the page does not.
  const tr = parseTransfer({ ...src, id: str(src.id) ?? str(src.transfer_id) ?? 'driver-view' });
  const customer = (raw.customer ?? (raw.transfer as Record<string, unknown> | undefined)?.customer ?? {}) as Record<string, unknown>;
  const customerName = str(customer.name);
  const customerPhone = str(customer.phone);
  const phoneDigits = customerPhone?.replace(/\D/g, '') ?? '';
  const status = tr?.status ?? str(raw.status) ?? '';
  const steps = nextSteps(status);
  const sk = statusKey(status);
  const statusLabel = sk in (messages.driver?.status ?? {}) ? t(`status.${sk}`) : status;

  const options = await getTransferOptions().catch(() => null);
  const ap = options?.airports.find((a) => a.code === tr?.airport);
  const airportName = ap ? localName(ap, lang, tr?.airport ?? '') : tr?.airport ?? '';
  const terminal = str(raw.terminal) ?? str((raw.transfer as Record<string, unknown> | undefined)?.terminal);
  const place = [tr?.address, tr?.district, 'İstanbul'].filter(Boolean).join(', ');
  const airportDest = ap?.lat != null && ap?.lng != null ? `${ap.lat},${ap.lng}` : airportName;
  const isArrival = tr?.direction !== 'departure';
  const pickupNav = isArrival ? airportDest : place;
  const dropoffNav = isArrival ? place : airportDest;
  const flight = tr?.flightNumber?.replace(/\s+/g, '').toLowerCase();

  const box = 'rounded-[14px] border border-rule bg-white p-4';
  const big = 'flex min-h-16 w-full items-center justify-center rounded-[14px] px-4 text-lg font-semibold';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-mute">{tr?.reference ?? 'Homesta'}</p>
        {langSwitch}
      </div>

      <h1 className="text-2xl font-medium tracking-[-0.02em]">
        {t('pickupAt')}: {tr?.pickupAt ? formatIstanbul(tr.pickupAt, lang) : '—'}
      </h1>
      <p className="-mt-3 text-sm text-mute">{t('istanbulTime')} · {statusLabel}</p>

      {e && <p role="alert" className="rounded-[14px] border border-stay/30 bg-stay/5 p-3 text-sm">{t(`errors.${e === 'transition' || e === 'link' || e === 'invalid' ? e : 'error'}`)}</p>}

      {/* The next step — the reason this page exists. */}
      {steps.length > 0 ? (
        <div className="flex flex-col gap-3">
          {steps.map((s) => (
            <form key={s} action={updateDriverStatus}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="status" value={s} />
              <input type="hidden" name="lang" value={lang} />
              <button type="submit" className={`${big} ${s === 'no_show' ? 'border border-ink bg-white text-ink' : 'bg-stay text-white'}`}>
                {t(`actions.${s}`)}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className={`${box} text-center font-medium`}>{t('finished')}</p>
      )}

      {/* Customer */}
      <section className={box}>
        <h2 className="mb-2 text-sm text-mute">{t('customer')}</h2>
        <p className="text-lg font-medium">{customerName ?? '—'}</p>
        {customerPhone && (
          <>
            <p className="mb-3 text-ink-soft" dir="ltr">{customerPhone}</p>
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${customerPhone}`} className={`${big} border border-ink text-base`}>{t('call')}</a>
              <a href={`https://wa.me/${phoneDigits}`} className={`${big} bg-ink text-base text-white`}>WhatsApp</a>
            </div>
          </>
        )}
      </section>

      {/* Route */}
      <section className={`${box} flex flex-col gap-3`}>
        <div>
          <h2 className="text-sm text-mute">{t('pickup')}</h2>
          <p className="font-medium">{isArrival ? [airportName, terminal].filter(Boolean).join(' · ') : place}</p>
          <a href={mapsDir(pickupNav)} className="mt-1 inline-block text-sm font-medium underline underline-offset-4">{t('navigate')}</a>
        </div>
        <div>
          <h2 className="text-sm text-mute">{t('dropoff')}</h2>
          <p className="font-medium">{isArrival ? place : airportName}</p>
          <a href={mapsDir(dropoffNav)} className="mt-1 inline-block text-sm font-medium underline underline-offset-4">{t('navigate')}</a>
        </div>
        {tr?.flightNumber && (
          <div>
            <h2 className="text-sm text-mute">{t('flight')}</h2>
            <p className="font-medium">{tr.flightNumber}</p>
            <a href={`https://www.flightradar24.com/data/flights/${encodeURIComponent(flight ?? '')}`} target="_blank" rel="noopener noreferrer"
              className="mt-1 inline-block text-sm font-medium underline underline-offset-4">{t('flightStatus')}</a>
          </div>
        )}
      </section>

      {/* Party */}
      <section className={`${box} grid grid-cols-3 gap-2 text-center`}>
        <div><p className="text-2xl font-semibold">{num(tr?.passengers) ?? '—'}</p><p className="text-xs text-mute">{t('passengers')}</p></div>
        <div><p className="text-2xl font-semibold">{num(tr?.luggage) ?? '—'}</p><p className="text-xs text-mute">{t('luggage')}</p></div>
        <div><p className="text-2xl font-semibold">{num(tr?.childSeats) ?? 0}</p><p className="text-xs text-mute">{t('childSeats')}</p></div>
      </section>

      {tr?.notes && (
        <section className={box}>
          <h2 className="mb-1 text-sm text-mute">{t('notes')}</h2>
          <p className="whitespace-pre-line">{tr.notes}</p>
        </section>
      )}
    </main>
  );
}
