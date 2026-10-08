/**
 * One outline icon per unit type, drawn as a set: 32×32 grid, 1.6 stroke,
 * round caps and joins, no fills — so the row reads as one family, and each
 * shape says what the type IS rather than "a house" eight times.
 *
 * Keys are the raw unit_type values (see STAY_TYPES in lib/stays/filters),
 * plus `all`, `hotel` (the host application form) and `car` (Homesta Cars).
 * A type with no bookable units draws no chip, so farm and bed wait here
 * unused until the first one is listed. Unknown names draw `other`.
 */
const PATHS: Record<string, React.ReactNode> = {
  // Four tiles: everything.
  all: (
    <>
      <rect x="5" y="5" width="9" height="9" rx="2" />
      <rect x="18" y="5" width="9" height="9" rx="2" />
      <rect x="5" y="18" width="9" height="9" rx="2" />
      <rect x="18" y="18" width="9" height="9" rx="2" />
    </>
  ),
  // A block of flats: stacked windows, one street door.
  apartment: (
    <>
      <rect x="8" y="4" width="16" height="24" rx="1" />
      <path d="M12 9h2M18 9h2M12 14h2M18 14h2M12 19h2M18 19h2" />
      <path d="M14 28v-4h4v4" />
      <path d="M5 28h22" />
    </>
  ),
  // A house of its own, with a pool in front.
  villa: (
    <>
      <path d="M4 15 16 6l12 9" />
      <path d="M7 13v11h18V13" />
      <path d="M14 24v-4a2 2 0 0 1 4 0v4" />
      <path d="M9.5 16.5h2.5v2.5H9.5zM20 16.5h2.5v2.5H20z" />
      <path d="M4 28c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4" />
    </>
  ),
  // One open room: the bed and a floor lamp in the same four walls.
  studio: (
    <>
      <rect x="4" y="6" width="24" height="21" rx="2" />
      <path d="M7 23v-4.5h11V23M7 21h11" />
      <path d="M8.5 18.5V17h3.5v1.5" />
      <path d="M23.5 23v-9M21.5 14h4" />
    </>
  ),
  // A bed with a crown: the premium room.
  suite: (
    <>
      <path d="M11 11 12.5 5l3.5 3 3.5-3L21 11z" />
      <path d="M4 26v-6a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v6" />
      <path d="M4 23h24" />
      <path d="M4 26v2M28 26v2" />
    </>
  ),
  // A numbered door: a room of its own inside a larger home or hotel.
  room: (
    <>
      <path d="M10 28V6h12v22" />
      <rect x="14" y="9.5" width="4" height="3" rx="0.6" />
      <circle cx="19" cy="18.5" r="1" />
      <path d="M5 28h22" />
    </>
  ),
  // A small wooden cabin / bungalow: steep roof, log walls, chimney.
  cabin: (
    <>
      <path d="M3 17 16 5l13 12" />
      <path d="M21 9.6V5h3v7.3" />
      <path d="M7 13.4V28h18V13.4" />
      <path d="M7 18h5M20 18h5M7 22.5h5M20 22.5h5" />
      <path d="M13 28v-8h6v8" />
      <circle cx="16" cy="12.5" r="1.4" />
    </>
  ),
  // A barn: gambrel roof, hay loft, cross-braced doors.
  farm: (
    <>
      <path d="M4 15.5 8 8l8-4 8 4 4 7.5" />
      <path d="M6 14v14h20V14" />
      <path d="M14.5 10.5h3v3h-3z" />
      <path d="M12 28v-8h8v8M12 20l8 8M20 20l-8 8" />
    </>
  ),
  // A single bed: the single-sleeper end of the catalogue.
  bed: (
    <>
      <path d="M5 25v-8a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v8" />
      <path d="M5 21h22" />
      <path d="M5 25v3M27 25v3" />
      <path d="M8 15v-2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2" />
    </>
  ),
  // "More": anything the catalogue has no better name for.
  other: (
    <>
      <circle cx="16" cy="16" r="11" />
      <circle cx="11" cy="16" r="1" />
      <circle cx="16" cy="16" r="1" />
      <circle cx="21" cy="16" r="1" />
    </>
  ),
  // A hotel: a building with its H sign (host application form).
  hotel: (
    <>
      <rect x="6" y="5" width="20" height="23" rx="1" />
      <path d="M12.5 9v6M19.5 9v6M12.5 12h7" />
      <path d="M10 19h2M20 19h2" />
      <path d="M14 28v-5h4v5" />
    </>
  ),
  // A car, in profile: Homesta Cars.
  car: (
    <>
      <path d="M8.5 13 11 8h10l2.5 5" />
      <path d="M16 8v5" />
      <path d="M7 23H5v-5l3.5-5h15l3.5 5v5h-2" />
      <path d="M13 23h6" />
      <circle cx="10" cy="23" r="2.6" />
      <circle cx="22" cy="23" r="2.6" />
    </>
  ),
};

interface CategoryIconProps {
  name: string;
  size?: number;
}

export function CategoryIcon({ name, size = 28 }: CategoryIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.other}
    </svg>
  );
}

/** The small "opens elsewhere" arrow beside an external item. */
export function ExternalArrow({ size = 9 }: { size?: number }) {
  return (
    // Points "outward" — up and away in the reading direction, so it mirrors in Arabic.
    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true" className="rtl:-scale-x-100">
      <path d="M3 7 7 3M4 3h3v3" />
    </svg>
  );
}
