import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { config } from '../config';
import { STATUSES } from '../data/meta';
import type { DistrictBoundary, Issue } from '../data/types';
import { boundaryLatLngs } from '../lib/geometry';
import { useStore } from '../store';
import markerSvg from '../../brand/map-marker.svg?raw';

interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  issues: Issue[];
  selectedId?: string | null;
  onSelect?: (issue: Issue) => void;
  center?: LatLng;
  zoom?: number;
  sizeByVotes?: boolean;
  voteLabelsAbove?: number;
  heat?: boolean;
  /** Draws the resident's dot at `you`. Nothing is drawn while the position is unknown. */
  showYou?: boolean;
  /** The resident's position; `accuracy` (meters) draws a faint circle when it's wide enough to matter. */
  you?: (LatLng & { accuracy?: number | null }) | null;
  /** The orange pin. With `onPick` it can be dragged, and tapping the map moves it. */
  pick?: LatLng | null;
  onPick?: (p: LatLng) => void;
  /** Change it to fly to `center` again even if `center` is unchanged (e.g. a "locate me" tap). */
  centerKey?: string | number;
  /** Outline the district and dim what's outside it. On by default when the district has a boundary. */
  showBoundary?: boolean;
  /** +/- buttons, in the top left unless `zoomPosition` says otherwise. */
  zoomControl?: boolean;
  zoomPosition?: L.ControlPosition;
  interactive?: boolean;
  className?: string;
}

const pinIcon = L.divIcon({
  className: '',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  html: markerSvg,
});

function radiusFor(issue: Issue, sizeByVotes: boolean) {
  return sizeByVotes ? 4 + Math.sqrt(issue.votes) * 0.85 : 6;
}

function FlyTo({ center, zoom, centerKey }: { center?: LatLng; zoom?: number; centerKey?: string | number }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    const target: [number, number] = [center.lat, center.lng];
    const z = zoom ?? map.getZoom();
    // flyTo divides by the map's size, so in a hidden (0×0) box it computes NaN and throws.
    const box = map.getContainer();
    if (box.clientWidth && box.clientHeight) map.flyTo(target, z, { duration: 0.6 });
    else map.setView(target, z, { animate: false });
  }, [center?.lat, center?.lng, centerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Everything outside the district, as one polygon with the district cut out (even-odd fill). */
const WORLD: [number, number][] = [
  [-85, -179.9],
  [85, -179.9],
  [85, 179.9],
  [-85, 179.9],
];

function Boundary({ boundary }: { boundary: DistrictBoundary }) {
  const polygons = useMemo(() => boundaryLatLngs(boundary), [boundary]);
  const mask = useMemo(() => [WORLD, ...polygons.map((rings) => rings[0])], [polygons]);
  return (
    <>
      <Polygon positions={mask} interactive={false} pathOptions={{ stroke: false, fillColor: '#141b2d', fillOpacity: 0.07 }} />
      {/* A polyline, not a polygon: Leaflet clips polygons to the view and would stroke the cut edge. */}
      {polygons.map((rings, i) => (
        <Polyline
          key={i}
          positions={rings}
          interactive={false}
          pathOptions={{ color: '#141b2d', weight: 1.5, opacity: 0.45, dashArray: '5 5' }}
        />
      ))}
    </>
  );
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Leaflet's own "Leaflet" link is optional; dropping it keeps the provider credit on one line. */
function AttributionPrefix() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);
  return null;
}

/**
 * A map inside a form: the wheel scrolls the page instead of zooming the map. A trackpad pinch
 * arrives as a wheel event with ctrl held, and that still zooms, like the buttons and a touch pinch.
 */
function WheelScrollsPage() {
  const map = useMap();
  useEffect(() => {
    const box = map.getContainer();
    // In the capture phase, so Leaflet's own wheel listener is on or off before the event reaches it.
    const onWheel = (e: WheelEvent) => map.scrollWheelZoom[e.ctrlKey ? 'enable' : 'disable']();
    box.addEventListener('wheel', onWheel, true);
    return () => box.removeEventListener('wheel', onWheel, true);
  }, [map]);
  return null;
}

function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function IssueMap({
  issues,
  selectedId,
  onSelect,
  center,
  zoom = 16,
  sizeByVotes = true,
  voteLabelsAbove,
  heat = false,
  showYou = false,
  you,
  pick,
  onPick,
  centerKey,
  showBoundary = true,
  zoomControl = false,
  zoomPosition = 'topleft',
  interactive = true,
  className = '',
}: Props) {
  const { district } = useStore();
  const start = center ?? district.center;
  const ordered = [...issues].sort((a, b) => a.votes - b.votes);

  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={zoom}
      zoomControl={false}
      attributionControl
      dragging={interactive}
      scrollWheelZoom={interactive && !onPick}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      className={`h-full w-full ${className}`}
    >
      <TileLayer url={config.mapTiles.url} attribution={config.mapTiles.attribution} />
      <ResizeWatcher />
      <AttributionPrefix />
      {/* A child rather than MapContainer's zoomControl option, which is read only once, when the map is made. */}
      {zoomControl && <ZoomControl position={zoomPosition} />}
      <FlyTo center={center} zoom={zoom} centerKey={centerKey} />
      {onPick && <ClickToPick onPick={onPick} />}
      {onPick && interactive && <WheelScrollsPage />}
      {showBoundary && district.boundary && <Boundary boundary={district.boundary} />}

      {heat &&
        ordered.map((issue) => (
          <Circle
            key={`heat-${issue.id}`}
            center={[issue.lat, issue.lng]}
            radius={30 + issue.votes * 1.4}
            pathOptions={{ stroke: false, fillColor: '#ef5a1f', fillOpacity: 0.12 }}
            eventHandlers={{ click: () => onSelect?.(issue) }}
          />
        ))}

      {ordered.map((issue) => {
        const selected = issue.id === selectedId;
        const color = STATUSES[issue.status].color;
        const r = radiusFor(issue, sizeByVotes);
        return (
          <CircleMarker
            key={`${issue.id}-${selected}`}
            center={[issue.lat, issue.lng]}
            radius={selected ? r + 4 : r}
            pathOptions={{
              color: selected ? '#141b2d' : 'white',
              weight: selected ? 2 : 1.5,
              dashArray: selected ? '3 3' : undefined,
              fillColor: color,
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect?.(issue) }}
          >
            {voteLabelsAbove !== undefined && issue.votes >= voteLabelsAbove && (
              <Tooltip permanent direction="right" offset={[r, 0]} className="vote-label">
                {issue.votes}
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}

      {selectedId &&
        issues
          .filter((i) => i.id === selectedId)
          .map((i) => (
            <CircleMarker
              key="halo"
              center={[i.lat, i.lng]}
              radius={radiusFor(i, sizeByVotes) + 14}
              interactive={false}
              pathOptions={{ stroke: false, fillColor: STATUSES[i.status].color, fillOpacity: 0.18 }}
            />
          ))}

      {showYou && you && you.accuracy != null && you.accuracy > 15 && (
        <Circle
          center={[you.lat, you.lng]}
          radius={you.accuracy}
          interactive={false}
          pathOptions={{ color: '#2563eb', weight: 1, opacity: 0.35, fillColor: '#2563eb', fillOpacity: 0.08 }}
        />
      )}
      {showYou && you && (
        <CircleMarker
          center={[you.lat, you.lng]}
          radius={6}
          interactive={false}
          pathOptions={{ color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
        />
      )}

      {pick && (
        <Marker
          key={`${pick.lat},${pick.lng}`}
          position={[pick.lat, pick.lng]}
          icon={pinIcon}
          draggable={Boolean(onPick)}
          autoPan
          eventHandlers={
            onPick
              ? {
                  dragend: (e) => {
                    const p = (e.target as L.Marker).getLatLng();
                    onPick({ lat: p.lat, lng: p.lng });
                  },
                }
              : undefined
          }
        />
      )}
    </MapContainer>
  );
}
