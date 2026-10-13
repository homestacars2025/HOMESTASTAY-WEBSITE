/**
 * The base-map style for every Google map on the site (unit page, hotel page,
 * /stays map) — one definition, so they cannot drift.
 */
/**
 * Clean, light base map. poi.business is OFF — hotels and every shop,
 * restaurant and brand — so a competitor never appears on our listing.
 * Transit, parks, places of worship, landmarks, hospitals and street names
 * stay. (A styles array, not a cloud Map ID: no Map ID is configured, and a
 * Map ID would ignore this array.)
 */
export const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 8 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -60 }, { lightness: 20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ saturation: -20 }, { lightness: 15 }] },
];
