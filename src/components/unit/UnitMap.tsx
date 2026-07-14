'use client';

import { MapContainer, TileLayer, Marker, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface UnitMapProps {
  latitude: number;
  longitude: number;
  /** Accessible marker label (unit title / city). */
  title: string;
  labels: {
    street: string;
    satellite: string;
  };
}

// Airbnb-style marker: a dark circle with a house glyph, built as an HTML
// divIcon so we control the look (no default Mapbox/Leaflet teardrop pin).
// --ink is the brand's dark surface color; the glyph is white for contrast.
const houseIcon = L.divIcon({
  className: '', // strip Leaflet's default .leaflet-div-icon white box
  html: `
    <div style="
      width:36px;height:36px;border-radius:9999px;
      background:#0E0E10;color:#fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      border:2px solid #fff;font-size:17px;line-height:1;">🏠</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18], // center the circle on the coordinate
});

/**
 * Interactive Leaflet map centered on the unit's coordinates. Client-only —
 * Leaflet touches `window`, so this is always loaded via a dynamic ssr:false
 * import (see UnitMapSection). Free OSM/Esri tiles → no API token required.
 */
export default function UnitMap({ latitude, longitude, title, labels }: UnitMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={14} // neighborhood level, matching Airbnb
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: 'var(--paper-warm)' }}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name={labels.street}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={labels.satellite}>
          <TileLayer
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <Marker position={[latitude, longitude]} icon={houseIcon} title={title} alt={title} />
    </MapContainer>
  );
}
