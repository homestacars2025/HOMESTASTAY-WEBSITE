/**
 * "$9", "$9.50" — the site's USD style (formatCardPrice, the booking card),
 * wrapped in a left-to-right isolate so "$28" cannot flip to "28$" inside an
 * Arabic sentence. There is no currency switcher yet: prices are USD in the
 * database and are shown as USD.
 */
export function formatServiceUsd(amount: number): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `⁦$${value}⁩`;
}
