/**
 * The site's map style is a cloud-based Google Map ID ("Homesta": light,
 * muted, hotels / restaurants / cafes hidden) — edited in the Google Cloud
 * console, not in code. Every Google map passes it as mapId; a local `styles`
 * array would conflict with it. AdvancedMarkerElement (our pins) requires it,
 * so without it the maps are not shown at all.
 */
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? '';

/**
 * A marker's HTML element, anchored at its CENTRE (AdvancedMarkerElement
 * anchors the bottom-centre by default — right for a pin tip, wrong for a
 * round badge that marks an area). Optional pixel offset (fan-out).
 */
export function centredContent(dx = 0, dy = 0): HTMLDivElement {
  const el = document.createElement('div');
  el.style.transform = `translate(${dx}px, calc(50% + ${dy}px))`;
  return el;
}
