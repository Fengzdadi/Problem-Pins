import type {
  AnalyticsEvent,
  AnalyticsEventName,
  AttentionRules,
  Category,
  District,
  DistrictBoundary,
  Issue,
  IssueUpdate,
  ScanPoint,
  Status,
} from '../../data/types';
import { nyDate } from '../../lib/format';
import type { Snapshot } from '../types';

// Row shapes returned by the database (see supabase/migrations), and their mapping to the
// domain model. Timestamps become New York calendar dates.

export interface DistrictRow {
  id: string;
  name: string;
  area: string;
  center_lat: number;
  center_lng: number;
  zoom: number;
  boundary: DistrictBoundary | null;
  categories: Category[];
  teams: string[];
  rules: AttentionRules;
  contact_email: string | null;
}

interface UpdateRow {
  id: string;
  role: 'partner' | 'resident';
  author: string | null;
  text: string;
  created_at: string;
  mine: boolean;
}

export interface IssueRow {
  id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  lat: number;
  lng: number;
  location_label: string;
  location_detail: string | null;
  photos: string[];
  via: string;
  owner: string | null;
  agency: string | null;
  hidden: boolean;
  hidden_reason: string | null;
  merged_into: string | null;
  fixed_at: string | null;
  created_at: string;
  is_user_report: boolean;
  votes: number;
  votes_this_week: number;
  following: number;
  confirmed_fixed: number;
  duplicates_merged: number;
  city_request: {
    sr: string;
    agency: string;
    routed_to: string;
    sent_at: string;
    sent_by: string;
    last_follow_up_at: string | null;
  } | null;
  updates: UpdateRow[];
  history: { text: string; created_at: string }[];
}

interface ScanPointRow {
  code: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  issue_id: string | null;
}

export interface SnapshotRow {
  district: DistrictRow;
  issues: IssueRow[];
  scan_points: ScanPointRow[];
  me: { voted: string[]; following: string[]; confirmed: Record<string, 'yes' | 'no'> };
}

export interface EventRow {
  id: number;
  name: string;
  issue_id: string | null;
  scan_code: string | null;
  props: AnalyticsEvent['props'] | null;
  at: string;
}

export function mapDistrict(row: DistrictRow): District {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    center: { lat: row.center_lat, lng: row.center_lng },
    zoom: row.zoom,
    ...(row.boundary ? { boundary: row.boundary } : {}),
    categories: row.categories,
    teams: row.teams,
    rules: row.rules,
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
  };
}

function mapUpdate(row: UpdateRow, districtName: string): IssueUpdate {
  const author = row.role === 'partner' ? (row.author ?? districtName) : row.mine ? 'You' : (row.author ?? 'Neighbor');
  return {
    id: row.id,
    author,
    role: row.role,
    text: row.text,
    date: nyDate(row.created_at),
    ...(row.mine ? { mine: true } : {}),
  };
}

export function mapIssue(row: IssueRow, districtName: string): Issue {
  const issue: Issue = {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    locationLabel: row.location_label,
    votes: row.votes,
    votesThisWeek: row.votes_this_week,
    createdAt: nyDate(row.created_at),
    owner: row.owner,
    photos: row.photos,
    updates: row.updates.map((u) => mapUpdate(u, districtName)),
    history: row.history.map((h) => ({ date: nyDate(h.created_at), text: h.text })),
    via: row.via,
    following: row.following,
    duplicatesMerged: row.duplicates_merged,
    confirmedFixed: row.confirmed_fixed,
  };
  if (row.location_detail) issue.locationDetail = row.location_detail;
  if (row.agency) issue.agency = row.agency;
  if (row.fixed_at) issue.fixedOn = nyDate(row.fixed_at);
  if (row.is_user_report) issue.isUserReport = true;
  if (row.hidden) issue.hidden = true;
  if (row.hidden_reason) issue.hiddenReason = row.hidden_reason;
  if (row.merged_into) issue.mergedInto = row.merged_into;
  const r = row.city_request;
  if (r) {
    issue.cityRequest = {
      sr: r.sr,
      agency: r.agency,
      routedTo: r.routed_to,
      sentOn: nyDate(r.sent_at),
      sentBy: r.sent_by,
      ...(r.last_follow_up_at ? { lastFollowUp: nyDate(r.last_follow_up_at) } : {}),
    };
  }
  return issue;
}

export function mapScanPoint(row: ScanPointRow): ScanPoint {
  return {
    code: row.code,
    name: row.name,
    detail: row.detail,
    lat: row.lat,
    lng: row.lng,
    ...(row.issue_id ? { issueId: row.issue_id } : {}),
  };
}

export function mapSnapshot(row: SnapshotRow): Snapshot {
  const district = mapDistrict(row.district);
  return {
    district,
    issues: row.issues.map((i) => mapIssue(i, district.name)),
    scanPoints: row.scan_points.map(mapScanPoint),
    me: { voted: row.me.voted, following: row.me.following, confirmed: row.me.confirmed },
  };
}

export function mapEvent(row: EventRow): AnalyticsEvent {
  return {
    name: row.name as AnalyticsEventName,
    ...(row.issue_id ? { issueId: row.issue_id } : {}),
    ...(row.scan_code ? { scanCode: row.scan_code } : {}),
    ...(row.props ? { props: row.props } : {}),
    at: new Date(row.at).toISOString(),
  };
}

// ---- errors ----

export const GENERIC_ERROR = 'Something went wrong. Please try again.';
export const OFFLINE_ERROR = 'Couldn’t reach Problem Pins. Check your connection and try again.';

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: string | number;
}

function isNetworkError(error: ErrorLike) {
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(error.message ?? '');
}

/**
 * Turns a Supabase error into one whose message is safe to show residents. Messages raised
 * on purpose by our database functions (SQLSTATE P0001) pass through; anything else is logged
 * and replaced with a generic message.
 */
export function toError(error: unknown): Error {
  const e = (error ?? {}) as ErrorLike;
  if (e.code === 'P0001' && e.message) return new Error(e.message);
  if (isNetworkError(e)) return new Error(OFFLINE_ERROR);
  console.error('Problem Pins backend error', error);
  return new Error(GENERIC_ERROR);
}

/** Storage upload errors: size and type limits come from the bucket settings. */
export function toUploadError(error: unknown): Error {
  const e = (error ?? {}) as ErrorLike;
  const text = `${e.message ?? ''} ${e.statusCode ?? ''} ${e.status ?? ''}`;
  if (/too large|exceeded the maximum|413/i.test(text)) return new Error('That photo is too large. Try a smaller one.');
  if (/mime type|invalid_mime_type|not supported/i.test(text)) return new Error('Only photos (JPEG, PNG or WebP) can be added.');
  if (/row-level security|unauthorized|403/i.test(text)) {
    return new Error('Couldn’t add the photo right now. Try again in a little while.');
  }
  return toError(error);
}
