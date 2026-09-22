const PATHS: Record<string, React.ReactNode> = {
  all: (
    <>
      <circle cx="9"  cy="9"  r="5" />
      <circle cx="23" cy="9"  r="5" />
      <circle cx="9"  cy="23" r="5" />
      <circle cx="23" cy="23" r="5" />
    </>
  ),
  apartment: (
    <>
      <rect x="7" y="4" width="18" height="25" />
      <path d="M11 9h3M18 9h3M11 14h3M18 14h3M11 19h3M18 19h3" />
      <path d="M13 29v-4h6v4" />
    </>
  ),
  villa: (
    <>
      <path d="M4 15 16 5l12 10" />
      <path d="M7 13v14h18V13" />
      <rect x="13" y="18" width="6" height="9" />
      <path d="M22 9V5h3v6" />
    </>
  ),
  cabin: (
    <>
      <path d="M4 16 16 6l12 10" />
      <path d="M6 14v13h20V14" />
      <path d="M6 27 26 14M26 27 6 14" />
      <rect x="13" y="20" width="6" height="7" />
    </>
  ),
  // A door: a room of its own inside a larger home or hotel.
  room: (
    <>
      <rect x="9" y="4" width="14" height="25" />
      <circle cx="19" cy="17" r="0.9" />
      <path d="M5 29h22" />
    </>
  ),
  // A bed: a bed in a shared space, the single-sleeper end of the catalogue.
  bed: (
    <>
      <path d="M4 24v-9a3 3 0 0 1 3-3h13a5 5 0 0 1 5 5v7" />
      <path d="M4 20h21" />
      <path d="M4 24v3M25 24v3" />
      <path d="M8 12V8h7v4" />
    </>
  ),
  // One open room: bed and kitchen under the same roofline.
  studio: (
    <>
      <rect x="5" y="7" width="22" height="20" rx="1" />
      <path d="M8 22v-4h9v4M8 20h9" />
      <path d="M21 13v9M20 13h4" />
    </>
  ),
  // A sofa: a suite is a room with a living space.
  suite: (
    <>
      <path d="M7 16v-3a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3" />
      <path d="M5 23v-6a2 2 0 0 1 4 0v2h14v-2a2 2 0 0 1 4 0v6z" />
      <path d="M7 23v3M25 23v3" />
    </>
  ),
  // A barn.
  farm: (
    <>
      <path d="M4 14 10 7h12l6 7" />
      <path d="M6 13v15h20V13" />
      <path d="M12 28v-8h8v8M12 20l8 8M20 20l-8 8" />
    </>
  ),
  // A map pin: a place the catalogue has no better name for.
  other: (
    <>
      <path d="M16 29s9-8.5 9-15a9 9 0 0 0-18 0c0 6.5 9 15 9 15z" />
      <circle cx="16" cy="14" r="3" />
    </>
  ),
};

// One path per unit_type (see STAY_TYPES in lib/stays/filters). A type with
// no visible units draws no chip, so farm and bed wait here unused until the
// first one is listed.

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
