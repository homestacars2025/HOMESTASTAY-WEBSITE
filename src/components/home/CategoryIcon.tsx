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
  hotels: (
    <>
      <rect x="6" y="4" width="20" height="25" />
      <path d="M10 9h2M15 9h2M20 9h2M10 14h2M15 14h2M20 14h2M10 19h2M20 19h2" />
      <path d="M13 29v-6h6v6" />
    </>
  ),
  farms: (
    <>
      <path d="M3 20s4-3 6 0 5 0 7 0 4-3 7 0 6 0 6 0" />
      <path d="M5 20v8h22v-8" />
      <path d="M16 5c-3 2-4 6-2 9 3-1 5-4 4-7" />
      <path d="M16 14V9" />
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
      {PATHS[name] ?? PATHS.apartments}
    </svg>
  );
}
