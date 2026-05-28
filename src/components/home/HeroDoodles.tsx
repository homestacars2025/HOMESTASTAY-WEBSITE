// Decorative travel doodle wall behind the hero.
// Two-level <g> per doodle: outer carries the CSS float class (animation only),
// inner carries the SVG transform attribute (position / rotation / scale).
// This separation prevents CSS transform from overriding SVG attribute transforms.
// aria-hidden on the parent wrapper in page.tsx; .doodle-desktop hidden on mobile.
export function HeroDoodles() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 540"
      fill="none"
      stroke="#0E0E10"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full"
    >
      {/* ── HOT AIR BALLOON (large) ── desktop only ── f1 ─────────────── */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(112,202) rotate(-8)" strokeWidth="2">
          <ellipse cx="0" cy="-20" rx="16" ry="20" />
          <path d="M -16,-20 Q 0,-34 16,-20" />
          <path d="M -16,-14 Q 0,-4 16,-14" />
          <line x1="-8" y1="-2" x2="-5" y2="14" />
          <line x1="8" y1="-2" x2="5" y2="14" />
          <rect x="-7" y="14" width="14" height="9" rx="1" />
        </g>
      </g>

      {/* ── HOT AIR BALLOON (small) ── desktop only ── f2 ─────────────── */}
      <g className="doodle-f2">
        <g className="doodle-desktop" transform="translate(1298,118) rotate(6) scale(0.72)" strokeWidth="2">
          <ellipse cx="0" cy="-20" rx="16" ry="20" />
          <path d="M -16,-20 Q 0,-34 16,-20" />
          <path d="M -16,-14 Q 0,-4 16,-14" />
          <line x1="-8" y1="-2" x2="-5" y2="14" />
          <line x1="8" y1="-2" x2="5" y2="14" />
          <rect x="-7" y="14" width="14" height="9" rx="1" />
        </g>
      </g>

      {/* ── CAMERA ── desktop only ── f3 ──────────────────────────────── */}
      <g className="doodle-f3">
        <g className="doodle-desktop" transform="translate(78,394) rotate(-14)" strokeWidth="2">
          <rect x="-18" y="-13" width="36" height="26" rx="3" />
          <circle cx="0" cy="2" r="9" />
          <circle cx="0" cy="2" r="5" />
          <rect x="-5" y="-17" width="10" height="5" rx="1" />
          <rect x="9" y="-17" width="7" height="4" rx="1" />
        </g>
      </g>

      {/* ── CLOUD (large) ── desktop only ── f4 ───────────────────────── */}
      <g className="doodle-f4">
        <g className="doodle-desktop" transform="translate(198,56) rotate(-3)" strokeWidth="2">
          <path d="M -26,6 A 8,8 0 0,1 -14,-2 A 12,12 0 0,1 4,-12 A 12,12 0 0,1 20,-4 A 8,8 0 0,1 26,6 Z" />
        </g>
      </g>

      {/* ── CLOUD (small) ── all screens ── f5 ────────────────────────── */}
      <g className="doodle-f5">
        <g transform="translate(648,46) rotate(4) scale(0.68)" strokeWidth="2">
          <path d="M -26,6 A 8,8 0 0,1 -14,-2 A 12,12 0 0,1 4,-12 A 12,12 0 0,1 20,-4 A 8,8 0 0,1 26,6 Z" />
        </g>
      </g>

      {/* ── PALM TREE ── desktop only ── f6 ───────────────────────────── */}
      <g className="doodle-f6">
        <g className="doodle-desktop" transform="translate(1378,358) rotate(7)" strokeWidth="2">
          <path d="M 0,30 Q 4,16 2,0" />
          <path d="M 2,0 Q 18,-8 22,-4" />
          <path d="M 2,0 Q -14,-10 -16,-6" />
          <path d="M 2,0 Q 8,-18 12,-16" />
          <path d="M 2,0 Q -6,-16 -10,-12" />
          <path d="M 2,0 Q 14,-4 16,3" />
        </g>
      </g>

      {/* ── HOUSE / VILLA ── desktop only ── f1 ───────────────────────── */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(174,473) rotate(-6)" strokeWidth="2">
          <rect x="-16" y="0" width="32" height="20" rx="1" />
          <path d="M -20,0 L 0,-16 L 20,0" />
          <rect x="-5" y="8" width="10" height="12" />
          <rect x="5" y="3" width="8" height="7" rx="1" />
          <rect x="-14" y="-16" width="5" height="8" />
        </g>
      </g>

      {/* ── SUITCASE ── desktop only ── f2 ────────────────────────────── */}
      <g className="doodle-f2">
        <g className="doodle-desktop" transform="translate(38,292) rotate(-11)" strokeWidth="2">
          <rect x="-16" y="-10" width="32" height="28" rx="3" />
          <path d="M -8,-10 L -8,-16 Q -8,-20 -4,-20 L 4,-20 Q 8,-20 8,-16 L 8,-10" />
          <line x1="-16" y1="2" x2="16" y2="2" />
          <circle cx="-10" cy="18" r="3" />
          <circle cx="10" cy="18" r="3" />
        </g>
      </g>

      {/* ── SUNGLASSES ── desktop only ── f3 ──────────────────────────── */}
      <g className="doodle-f3">
        <g className="doodle-desktop" transform="translate(1236,300) rotate(9)" strokeWidth="2">
          <circle cx="-13" cy="0" r="10" />
          <circle cx="13" cy="0" r="10" />
          <line x1="-3" y1="0" x2="3" y2="0" />
          <path d="M -23,-2 L -30,-4" />
          <path d="M 23,-2 L 30,-4" />
        </g>
      </g>

      {/* ── SAILBOAT ── all screens ── f4 ─────────────────────────────── */}
      <g className="doodle-f4">
        <g transform="translate(598,497) rotate(-3)" strokeWidth="2">
          <path d="M -20,6 Q 0,13 20,6 L 16,-2 L -16,-2 Z" />
          <line x1="0" y1="-2" x2="0" y2="-26" />
          <path d="M 0,-24 L 16,0 L 0,0 Z" />
          <path d="M 0,-16 L -12,-2 L 0,-2 Z" />
        </g>
      </g>

      {/* ── AIRPLANE ── all screens ── f5 ─────────────────────────────── */}
      <g className="doodle-f5">
        <g transform="translate(738,38) rotate(-22)" strokeWidth="2">
          <path d="M -24,0 Q -6,-3 8,-2 L 24,0 Q 6,3 -6,2 Z" />
          <path d="M -4,-2 L -8,-16 L 10,-4" />
          <path d="M 19,-2 L 22,-9 L 24,-2" />
        </g>
      </g>

      {/* ── LOCATION PIN ── all screens ── f6 ─────────────────────────── */}
      <g className="doodle-f6">
        <g transform="translate(820,493) rotate(8)" strokeWidth="2">
          <path d="M -10,-10 A 10,10 0 1,0 10,-10 L 0,16 Z" />
          <circle cx="0" cy="-10" r="4" />
        </g>
      </g>

      {/* ── SUN WITH RAYS ── desktop only ── f1 ───────────────────────── */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(1076,464) rotate(10)" strokeWidth="2">
          <circle cx="0" cy="0" r="10" />
          <line x1="0"    y1="-14" x2="0"    y2="-19" />
          <line x1="9.9"  y1="-9.9"  x2="13.4" y2="-13.4" />
          <line x1="14"   y1="0"   x2="19"   y2="0" />
          <line x1="9.9"  y1="9.9"  x2="13.4" y2="13.4" />
          <line x1="0"    y1="14"  x2="0"    y2="19" />
          <line x1="-9.9" y1="9.9"  x2="-13.4" y2="13.4" />
          <line x1="-14"  y1="0"   x2="-19"  y2="0" />
          <line x1="-9.9" y1="-9.9" x2="-13.4" y2="-13.4" />
        </g>
      </g>

      {/* ── GALATA TOWER ── desktop only ── f2 ────────────────────────── */}
      <g className="doodle-f2">
        <g className="doodle-desktop" transform="translate(1400,266) rotate(2)" strokeWidth="2">
          <path d="M -7,26 L -7,-10 Q -7,-14 0,-18 Q 7,-14 7,-10 L 7,26" />
          <path d="M -11,26 L -11,22 L 11,22 L 11,26" />
          <path d="M -7,-10 L 0,-30 L 7,-10" />
          <circle cx="0" cy="-2" r="2.5" />
          <circle cx="0" cy="10" r="2.5" />
          <line x1="-9" y1="-10" x2="9" y2="-10" />
        </g>
      </g>

      {/* ── MOSQUE (small) ── all screens ── f3 ───────────────────────── */}
      <g className="doodle-f3">
        <g transform="translate(682,503) rotate(-7)" strokeWidth="2">
          <path d="M -13,0 A 13,15 0 0,1 13,0" />
          <rect x="-15" y="0" width="30" height="14" />
          <line x1="-10" y1="14" x2="-10" y2="-18" />
          <path d="M -13,-18 L -10,-24 L -7,-18" />
          <line x1="10" y1="14" x2="10" y2="-18" />
          <path d="M 7,-18 L 10,-24 L 13,-18" />
          <path d="M -4,14 A 4,5 0 0,1 4,14" />
        </g>
      </g>

      {/* ── TURKISH TEA GLASS (çay) ── desktop only ── f4 ─────────────── */}
      <g className="doodle-f4">
        <g className="doodle-desktop" transform="translate(1116,435) rotate(11)" strokeWidth="2">
          <path d="M -8,-14 Q -12,-7 -7,0 Q -12,7 -8,14 L 8,14 Q 12,7 7,0 Q 12,-7 8,-14 Z" />
          <path d="M -12,14 Q 0,19 12,14" />
          <path d="M -3,-16 Q -5,-21 -3,-26" />
          <path d="M 0,-16 Q -2,-21 0,-26" />
          <path d="M 4,-16 Q 2,-21 4,-26" />
        </g>
      </g>

      {/* ── COMPASS ── desktop only ── f5 ─────────────────────────────── */}
      <g className="doodle-f5">
        <g className="doodle-desktop" transform="translate(326,500) rotate(15)" strokeWidth="2">
          <circle cx="0" cy="0" r="14" />
          <path d="M 0,-14 L 5,0 L 0,14 L -5,0 Z" />
          <line x1="-14" y1="0" x2="-7" y2="0" />
          <line x1="7" y1="0" x2="14" y2="0" />
          <circle cx="0" cy="0" r="2" />
        </g>
      </g>

      {/* ── HEADLINE FILL — left fringe ─────────────────────────────── */}

      {/* Balloon (tiny) — left of headline ── f6 */}
      <g className="doodle-f6">
        <g className="doodle-desktop" transform="translate(302,148) rotate(-7) scale(0.55)" strokeWidth="2">
          <ellipse cx="0" cy="-20" rx="16" ry="20" />
          <path d="M -16,-20 Q 0,-34 16,-20" />
          <path d="M -16,-14 Q 0,-4 16,-14" />
          <line x1="-8" y1="-2" x2="-5" y2="14" />
          <line x1="8" y1="-2" x2="5" y2="14" />
          <rect x="-7" y="14" width="14" height="9" rx="1" />
        </g>
      </g>

      {/* Camera — left, toward subtitle ── f1 */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(374,218) rotate(12) scale(0.55)" strokeWidth="2">
          <rect x="-18" y="-13" width="36" height="26" rx="3" />
          <circle cx="0" cy="2" r="9" />
          <circle cx="0" cy="2" r="5" />
          <rect x="-5" y="-17" width="10" height="5" rx="1" />
          <rect x="9" y="-17" width="7" height="4" rx="1" />
        </g>
      </g>

      {/* ── HEADLINE FILL — right fringe ────────────────────────────── */}

      {/* Sun (small) — right of headline ── f2 */}
      <g className="doodle-f2">
        <g className="doodle-desktop" transform="translate(1112,142) rotate(-5) scale(0.56)" strokeWidth="2">
          <circle cx="0" cy="0" r="10" />
          <line x1="0"    y1="-14" x2="0"    y2="-19" />
          <line x1="9.9"  y1="-9.9"  x2="13.4" y2="-13.4" />
          <line x1="14"   y1="0"   x2="19"   y2="0" />
          <line x1="9.9"  y1="9.9"  x2="13.4" y2="13.4" />
          <line x1="0"    y1="14"  x2="0"    y2="19" />
          <line x1="-9.9" y1="9.9"  x2="-13.4" y2="13.4" />
          <line x1="-14"  y1="0"   x2="-19"  y2="0" />
          <line x1="-9.9" y1="-9.9" x2="-13.4" y2="-13.4" />
        </g>
      </g>

      {/* Cloud (tiny) — right, toward subtitle ── f3 */}
      <g className="doodle-f3">
        <g className="doodle-desktop" transform="translate(1052,216) rotate(9) scale(0.52)" strokeWidth="2">
          <path d="M -26,6 A 8,8 0 0,1 -14,-2 A 12,12 0 0,1 4,-12 A 12,12 0 0,1 20,-4 A 8,8 0 0,1 26,6 Z" />
        </g>
      </g>

      {/* ── HEADLINE FILL — upper centre band (y ≈ 84–112) ─────────── */}

      {/* Airplane — upper-left centre ── f1 ── desktop only */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(502,103) rotate(15) scale(0.46)" strokeWidth="2">
          <path d="M -24,0 Q -6,-3 8,-2 L 24,0 Q 6,3 -6,2 Z" />
          <path d="M -4,-2 L -8,-16 L 10,-4" />
          <path d="M 19,-2 L 22,-9 L 24,-2" />
        </g>
      </g>

      {/* Location pin — top centre ── f2 ── all screens */}
      <g className="doodle-f2">
        <g transform="translate(718,84) rotate(-8) scale(0.47)" strokeWidth="2">
          <path d="M -10,-10 A 10,10 0 1,0 10,-10 L 0,16 Z" />
          <circle cx="0" cy="-10" r="4" />
        </g>
      </g>

      {/* Cloud (tiny) — upper-right centre ── f3 ── desktop only */}
      <g className="doodle-f3">
        <g className="doodle-desktop" transform="translate(942,108) rotate(6) scale(0.49)" strokeWidth="2">
          <path d="M -26,6 A 8,8 0 0,1 -14,-2 A 12,12 0 0,1 4,-12 A 12,12 0 0,1 20,-4 A 8,8 0 0,1 26,6 Z" />
        </g>
      </g>

      {/* ── HEADLINE FILL — mid centre band (y ≈ 170–205) ──────────── */}

      {/* Compass — left-centre headline ── f4 ── desktop only */}
      <g className="doodle-f4">
        <g className="doodle-desktop" transform="translate(463,198) rotate(-11) scale(0.47)" strokeWidth="2">
          <circle cx="0" cy="0" r="14" />
          <path d="M 0,-14 L 5,0 L 0,14 L -5,0 Z" />
          <line x1="-14" y1="0" x2="-7" y2="0" />
          <line x1="7" y1="0" x2="14" y2="0" />
          <circle cx="0" cy="0" r="2" />
        </g>
      </g>

      {/* House — left-centre in headline ── f5 ── all screens */}
      <g className="doodle-f5">
        <g transform="translate(627,173) rotate(10) scale(0.49)" strokeWidth="2">
          <rect x="-16" y="0" width="32" height="20" rx="1" />
          <path d="M -20,0 L 0,-16 L 20,0" />
          <rect x="-5" y="8" width="10" height="12" />
          <rect x="5" y="3" width="8" height="7" rx="1" />
          <rect x="-14" y="-16" width="5" height="8" />
        </g>
      </g>

      {/* Suitcase — right-centre in headline ── f6 ── all screens */}
      <g className="doodle-f6">
        <g transform="translate(822,179) rotate(-8) scale(0.47)" strokeWidth="2">
          <rect x="-16" y="-10" width="32" height="28" rx="3" />
          <path d="M -8,-10 L -8,-16 Q -8,-20 -4,-20 L 4,-20 Q 8,-20 8,-16 L 8,-10" />
          <line x1="-16" y1="2" x2="16" y2="2" />
          <circle cx="-10" cy="18" r="3" />
          <circle cx="10" cy="18" r="3" />
        </g>
      </g>

      {/* Mosque — right-centre headline ── f1 ── desktop only */}
      <g className="doodle-f1">
        <g className="doodle-desktop" transform="translate(1002,202) rotate(9) scale(0.49)" strokeWidth="2">
          <path d="M -13,0 A 13,15 0 0,1 13,0" />
          <rect x="-15" y="0" width="30" height="14" />
          <line x1="-10" y1="14" x2="-10" y2="-18" />
          <path d="M -13,-18 L -10,-24 L -7,-18" />
          <line x1="10" y1="14" x2="10" y2="-18" />
          <path d="M 7,-18 L 10,-24 L 13,-18" />
          <path d="M -4,14 A 4,5 0 0,1 4,14" />
        </g>
      </g>

      {/* ── HEADLINE FILL — lower centre band (y ≈ 265–300) ────────── */}

      {/* Tea glass — centre subtitle ── f4 ── all screens */}
      <g className="doodle-f4">
        <g transform="translate(768,268) rotate(-9) scale(0.54)" strokeWidth="2">
          <path d="M -8,-14 Q -12,-7 -7,0 Q -12,7 -8,14 L 8,14 Q 12,7 7,0 Q 12,-7 8,-14 Z" />
          <path d="M -12,14 Q 0,19 12,14" />
          <path d="M -3,-16 Q -5,-21 -3,-26" />
          <path d="M 0,-16 Q -2,-21 0,-26" />
          <path d="M 4,-16 Q 2,-21 4,-26" />
        </g>
      </g>

      {/* Sailboat — lower-left centre ── f2 ── all screens */}
      <g className="doodle-f2">
        <g transform="translate(557,297) rotate(-6) scale(0.51)" strokeWidth="2">
          <path d="M -20,6 Q 0,13 20,6 L 16,-2 L -16,-2 Z" />
          <line x1="0" y1="-2" x2="0" y2="-26" />
          <path d="M 0,-24 L 16,0 L 0,0 Z" />
          <path d="M 0,-16 L -12,-2 L 0,-2 Z" />
        </g>
      </g>

      {/* Palm tree — lower-right centre ── f3 ── all screens */}
      <g className="doodle-f3">
        <g transform="translate(904,294) rotate(7) scale(0.49)" strokeWidth="2">
          <path d="M 0,30 Q 4,16 2,0" />
          <path d="M 2,0 Q 18,-8 22,-4" />
          <path d="M 2,0 Q -14,-10 -16,-6" />
          <path d="M 2,0 Q 8,-18 12,-16" />
          <path d="M 2,0 Q -6,-16 -10,-12" />
          <path d="M 2,0 Q 14,-4 16,3" />
        </g>
      </g>
    </svg>
  );
}
