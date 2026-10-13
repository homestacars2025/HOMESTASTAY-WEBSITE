import {
  Baby, BellRing, ConciergeBell, Coffee, CookingPot, Flower2, Plane, Shirt, Sunset, TreePalm, Trees, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { HotelServiceKey } from '@/lib/types/unit';

/** One icon per hotel service — shared by the unit page and the hotel page. */
export const HOTEL_SERVICE_ICONS: Record<HotelServiceKey, LucideIcon> = {
  breakfast: Coffee,
  restaurant: UtensilsCrossed,
  reception_24h: ConciergeBell,
  room_service: BellRing,
  spa: Flower2,
  airport_shuttle: Plane,
  beach_access: TreePalm,
  sea_view: Sunset,
  laundry: Shirt,
  kids_club: Baby,
  garden: Trees,
  bbq: CookingPot,
};
