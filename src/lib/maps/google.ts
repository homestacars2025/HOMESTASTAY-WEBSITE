/**
 * Google Maps JS, loaded once per page, on demand (the unit map calls this
 * only when its box scrolls into view). Browser key, referrer-restricted to
 * homestastay.com — it is public by nature; never use it server-side.
 *
 * The language is fixed when the script loads (Google's rule), so it is the
 * page locale; region=TR biases names and borders for Türkiye.
 */

let loading: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string, language: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser only'));
  // The types declare `google` as always present; at runtime it is not until the script runs.
  const g = (window as { google?: { maps?: { importLibrary?: unknown } } }).google;
  if (typeof g?.maps?.importLibrary === 'function') return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const callback = '__hsGoogleMapsReady';
    (window as unknown as Record<string, () => void>)[callback] = () => resolve();
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      language,
      region: 'TR',
      callback,
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
