/**
 * A unit's extra services as public_unit_services() returns them — already
 * localised and already priced for the guest. price_usd is the FINAL guest
 * price per pricing unit; nothing here is ever recomputed in the browser.
 */
export type ServicePricingUnit =
  | 'per_booking'
  | 'per_night'
  | 'per_item'
  | 'per_guest'
  | 'per_guest_night';

export interface UnitService {
  id:           string;
  key:          string;
  name:         string;
  description:  string | null;
  /** A lucide icon name, kebab-case ("baby", "utensils-crossed"). */
  icon_key:     string | null;
  pricing_unit: ServicePricingUnit;
  price_usd:    number;
  /** Upper bound for the quantity stepper on per_item services. */
  max_quantity: number | null;
}

/** What the guest picked: the shape quote_unit_services() takes. */
export interface ServiceSelection {
  unit_service_id: string;
  quantity:        number;
}

/** quote_unit_services() for one set of dates, guests and selections. */
export interface ServicesQuote {
  nights:    number;
  guests:    number;
  total_usd: number;
  lines: {
    id:           string;
    name:         string;
    pricing_unit: ServicePricingUnit;
    price_usd:    number;
    qty:          number;
    total:        number;
  }[];
}

export const PRICING_UNITS: readonly ServicePricingUnit[] = [
  'per_booking', 'per_night', 'per_item', 'per_guest', 'per_guest_night',
];

/** The services functions speak ar/tr/en; Russian reads the English copy. */
export function servicesLang(locale: string): 'ar' | 'tr' | 'en' {
  return locale === 'ar' || locale === 'tr' ? locale : 'en';
}
