// Domain model shared by every screen and both backends (demo + Supabase).
// Dates are calendar dates in New York time, formatted `YYYY-MM-DD`; timestamps are ISO strings.
// See docs/ARCHITECTURE.md before changing anything here: other modules depend on it.

export type Category = 'lighting' | 'seating' | 'accessibility' | 'litter' | 'noise' | 'other';

export type Status = 'open' | 'in_review' | 'scheduled' | 'sent_to_city' | 'fixed';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface IssueUpdate {
  id: string;
  /** Display name: the district for partner updates, "Neighbor"/"You" for residents. */
  author: string;
  role: 'partner' | 'resident';
  text: string;
  date: string;
  /** True when this device/browser wrote it. */
  mine?: boolean;
}

export interface HistoryEvent {
  date: string;
  text: string;
}

export interface CityRequest {
  sr: string;
  agency: string;
  routedTo: string;
  sentOn: string;
  sentBy: string;
  lastFollowUp?: string;
}

/** What staff type in when they forward a problem to the City (the SR number comes from 311). */
export interface CityRequestInput {
  sr: string;
  agency: string;
  routedTo?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  lat: number;
  lng: number;
  locationLabel: string;
  locationDetail?: string;
  /** Counts are derived from vote/follow records by the backend, never written directly. */
  votes: number;
  votesThisWeek: number;
  createdAt: string;
  owner: string | null;
  /** City agency that owns the asset, when the District can't fix it directly. */
  agency?: string;
  photos: string[];
  cityRequest?: CityRequest;
  updates: IssueUpdate[];
  history: HistoryEvent[];
  via: string;
  following: number;
  duplicatesMerged: number;
  confirmedFixed: number;
  fixedOn?: string;
  isUserReport?: boolean;
  /** Staff removed it from the public map. Only staff ever receive hidden issues. */
  hidden?: boolean;
  hiddenReason?: string;
  /** Staff merged it into another issue as a duplicate. */
  mergedInto?: string;
}

/** When the dashboard flags an issue (see `src/org/actions.tsx`). */
export interface AttentionRules {
  /** Unowned issues with this many votes get flagged for review. */
  reviewVotes: number;
  /** ...or after this many days open. */
  reviewDays: number;
  /** City-owned issues with this many votes get flagged to forward to 311. */
  forwardVotes: number;
  /** City requests with no reply for this many days get flagged for a nudge. */
  cityNoReplyDays: number;
}

/** Minimal GeoJSON geometry for a district boundary, coordinates in [lng, lat] order. */
export type DistrictBoundary =
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };

/** The organization a deployment serves: a BID, a community district office, a park conservancy... */
export interface District {
  id: string;
  /** Who residents are talking to, e.g. "West Side District" or "Manhattan Community Board 8". */
  name: string;
  /** The neighborhood people recognise, e.g. "West Chelsea". */
  area: string;
  center: LatLng;
  zoom: number;
  /** Pins outside the boundary are refused. No boundary = no limit. */
  boundary?: DistrictBoundary;
  /** Which of the fixed categories this district takes, in display order. */
  categories: Category[];
  /** Teams work can be assigned to, e.g. "BID crew". */
  teams: string[];
  rules: AttentionRules;
  /** Shown to residents as the human contact for the program. */
  contactEmail?: string;
}

/** A printed QR code at a fixed spot (noticeboard, bench, lamp post). */
export interface ScanPoint {
  /** Printed on the poster and in the short link, e.g. "Q-12". Never reuse a code. */
  code: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  /** A problem already reported at this spot, shown first on the landing page. */
  issueId?: string;
}

/** Signed-in organization staff. */
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  districtId: string;
}

/** What this device/browser has done. Residents have no account. */
export interface MyState {
  voted: string[];
  following: string[];
  confirmed: Record<string, 'yes' | 'no'>;
}

/** Optional contact a resident leaves to get updates. Never shown publicly. */
export interface FollowContact {
  email?: string;
  phone?: string;
}

export type AnalyticsEventName =
  | 'map_view'
  | 'scan_view'
  | 'issue_view'
  | 'pin_start'
  | 'pin_submit'
  | 'vote'
  | 'follow'
  | 'comment'
  | 'confirm_fix'
  | 'staff_update'
  | 'staff_status'
  | 'staff_assign'
  | 'staff_send_to_city'
  | 'staff_nudge'
  | 'staff_hide'
  | 'staff_merge';

/** Product analytics for the experiments. No personal data in here, ever. */
export interface AnalyticsEvent {
  name: AnalyticsEventName;
  issueId?: string;
  scanCode?: string;
  props?: Record<string, string | number | boolean | null>;
  /** ISO timestamp, set by the backend when the event is recorded. */
  at: string;
}
