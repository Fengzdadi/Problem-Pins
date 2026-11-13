import { CATEGORY_ORDER } from './meta';
import { NEIGHBORHOOD_CENTER, at } from './geo';
import type { District, ScanPoint } from './types';

const corner = (street: number, ave: number): [number, number] => {
  const p = at(street, ave);
  return [p.lng, p.lat];
};

/** The fictional BID the demo is set in. Live deployments load their district from the backend. */
export const DEMO_DISTRICT: District = {
  id: 'west-side-demo',
  name: 'West Side District',
  area: 'West Chelsea',
  center: NEIGHBORHOOD_CENTER,
  zoom: 16,
  // W 13th to W 23rd St, 8th to 11th Ave.
  boundary: {
    type: 'Polygon',
    coordinates: [[corner(13, -1), corner(23, -1), corner(23, 2), corner(13, 2), corner(13, -1)]],
  },
  categories: CATEGORY_ORDER,
  teams: ['BID crew', 'West Side District staff'],
  rules: { reviewVotes: 50, reviewDays: 30, forwardVotes: 25, cityNoReplyDays: 10 },
};

export const DEMO_SCAN_POINTS: ScanPoint[] = [
  {
    code: 'Q-12',
    name: 'BID noticeboard, W 16th St',
    detail: 'Between 9th and 10th Ave',
    ...at(16, 0.45),
    issueId: 'PP-2402',
  },
];
