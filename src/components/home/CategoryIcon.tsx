const PATHS: Record<string, React.ReactNode> = {
  all: (
    <>
      <circle cx="9"  cy="9"  r="5" />
      <circle cx="23" cy="9"  r="5" />
      <circle cx="9"  cy="23" r="5" />
      <circle cx="23" cy="23" r="5" />
    </>
  ),
  apartments: (
    <>
      <rect x="7" y="4" width="18" height="25" />
      <path d="M11 9h3M18 9h3M11 14h3M18 14h3M11 19h3M18 19h3" />
      <path d="M13 29v-4h6v4" />
    </>
  ),
  villas: (
    <>
      <path d="M4 15 16 5l12 10" />
      <path d="M7 13v14h18V13" />
      <rect x="13" y="18" width="6" height="9" />
      <path d="M22 9V5h3v6" />
    </>
  ),
  cabins: (
    <>
      <path d="M4 16 16 6l12 10" />
      <path d="M6 14v13h20V14" />
      <path d="M6 27 26 14M26 27 6 14" />
      <rect x="13" y="20" width="6" height="7" />
    </>
  ),
  // A bed: rooms and suites, the single-space end of the catalogue.
  rooms: (
    <>
      <path d="M4 24v-9a3 3 0 0 1 3-3h13a5 5 0 0 1 5 5v7" />
      <path d="M4 20h21" />
      <path d="M4 24v3M25 24v3" />
      <path d="M8 12V8h7v4" />
    </>
  ),
};

// hotels and farms were removed deliberately, not lost: the catalogue holds
// zero units of either type, and a chip is a promise that something is behind
// it. See lib/stays/categories.

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
      {PATHS[name] ?? PATHS.apartments}
    </svg>
  );
}
