// Manhattan's grid is tilted ~29°, so street/avenue positions are mapped with a
// linear transform anchored at 9th Ave & W 14th St. `ave` counts avenues west
// of 9th Ave (1 = 10th Ave, -1 = 8th Ave).
const LAT0 = 40.74055;
const LNG0 = -74.0052;
const ST_LAT = 0.00058;
const ST_LNG = 0.0004;
const AVE_LAT = 0.0016;
const AVE_LNG = -0.003;

export function at(street: number, ave: number) {
  return {
    lat: LAT0 + (street - 14) * ST_LAT + ave * AVE_LAT,
    lng: LNG0 + (street - 14) * ST_LNG + ave * AVE_LNG,
  };
}

export const NEIGHBORHOOD_CENTER = at(16.6, 0.45);
export const YOU_ARE_HERE = at(16.15, 0.4);

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeLocation(lat: number, lng: number) {
  const dLat = lat - LAT0;
  const dLng = lng - LNG0;
  const det = ST_LAT * AVE_LNG - AVE_LAT * ST_LNG;
  const street = 14 + (dLat * AVE_LNG - AVE_LAT * dLng) / det;
  const ave = (ST_LAT * dLng - ST_LNG * dLat) / det;
  const nearestStreet = Math.round(street);
  const aveNumber = 9 + ave;
  const nearestAve = Math.round(aveNumber);
  const onAvenue = Math.abs(aveNumber - nearestAve) * 260 < Math.abs(street - nearestStreet) * 80;
  if (onAvenue) {
    return `${ordinal(nearestAve)} Ave near W ${ordinal(nearestStreet)} St`;
  }
  const west = Math.floor(aveNumber);
  return `W ${ordinal(nearestStreet)} St, ${ordinal(west)}–${ordinal(west + 1)} Ave`;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
