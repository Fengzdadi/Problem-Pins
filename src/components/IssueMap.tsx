import { useEffect } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { STATUSES } from '../data/meta';
import { NEIGHBORHOOD_CENTER, YOU_ARE_HERE } from '../data/geo';
import type { Issue } from '../data/types';
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
  showYou?: boolean;
  pick?: LatLng | null;
  onPick?: (p: LatLng) => void;
  zoomControl?: boolean;
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

function FlyTo({ center, zoom }: { center?: LatLng; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], zoom ?? map.getZoom(), { duration: 0.6 });
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
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
  pick,
  onPick,
  zoomControl = false,
  interactive = true,
  className = '',
}: Props) {
  const start = center ?? NEIGHBORHOOD_CENTER;
  const ordered = [...issues].sort((a, b) => a.votes - b.votes);

  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={zoom}
      zoomControl={zoomControl}
      attributionControl
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      className={`h-full w-full ${className}`}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'      />
      <ResizeWatcher />
      <FlyTo center={center} zoom={zoom} />
      {onPick && <ClickToPick onPick={onPick} />}

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

      {showYou && (
        <CircleMarker
          center={[YOU_ARE_HERE.lat, YOU_ARE_HERE.lng]}
          radius={6}
          interactive={false}
          pathOptions={{ color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
        />
      )}

      {pick && <Marker key={`${pick.lat},${pick.lng}`} position={[pick.lat, pick.lng]} icon={pinIcon} />}
    </MapContainer>
  );
}
