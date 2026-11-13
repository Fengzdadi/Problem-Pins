import type { AnalyticsEvent, AnalyticsEventName, Category, Issue, ScanPoint } from '../data/types';
import type { Threshold } from './experimentSettings';
import { daysBetween, median, nyDate } from './format';

/**
 * Pure calculations behind the Reports screen: monthly figures from issues, and experiment
 * metrics from analytics events. No React, no store, no dates from the clock: callers pass
 * `today` so the demo's frozen date and tests both work.
 *
 * Event counts are counts of events, not of people: events carry no identity by design.
 */

// ---------- months ----------

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-10-14` → `2026-10`. */
export function monthOf(date: string) {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** `2026-10` → `October 2026`. */
export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Months with data, from the first pin's month to `today`'s month, newest first. */
export function reportMonths(issues: Pick<Issue, 'createdAt'>[], today: string) {
  const last = monthOf(today);
  const first = issues.reduce((min, i) => (monthOf(i.createdAt) < min ? monthOf(i.createdAt) : min), last);
  const months: string[] = [];
  for (let m = last; m >= first; m = shiftMonth(m, -1)) months.push(m);
  return months;
}

// ---------- monthly report from issues ----------

export interface CategoryFigures {
  category: Category;
  pinned: number;
  fixed: number;
  /** Median days from pin to fix for problems fixed this month; null when none were. */
  medianDaysToFix: number | null;
}

export interface MonthReport {
  month: string;
  /** True when the month is still running; figures are "so far". */
  partial: boolean;
  /** Last day counted: `today` for the running month, otherwise the month's last day. */
  through: string;
  pinned: number;
  pinnedPrev: number;
  fixed: number;
  /** Fixed this month and confirmed by at least one resident. */
  confirmed: number;
  medianDaysToFix: number | null;
  byCategory: CategoryFigures[];
  /** Most-pinned category this month (ties: the order of `categories`). */
  topCategory: { category: Category; pinned: number } | null;
  /** Hidden by staff (spam, off-topic): left out of every figure. */
  hidden: number;
}

/**
 * Figures for one month. Pins count every report made that month, including ones later
 * merged as duplicates (they were still pins), but not ones staff hid.
 */
export function monthReport(issues: Issue[], month: string, today: string, categories: Category[]): MonthReport {
  const inMonth = (d?: string) => Boolean(d) && monthOf(d!) === month;
  const counted = issues.filter((i) => !i.hidden);
  const pinned = counted.filter((i) => inMonth(i.createdAt));
  const fixed = counted.filter((i) => !i.mergedInto && i.status === 'fixed' && inMonth(i.fixedOn));
  const days = (list: Issue[]) => list.map((i) => daysBetween(i.createdAt, i.fixedOn));

  const byCategory = categories.map((category) => {
    const f = fixed.filter((i) => i.category === category);
    return {
      category,
      pinned: pinned.filter((i) => i.category === category).length,
      fixed: f.length,
      medianDaysToFix: f.length ? median(days(f)) : null,
    };
  });
  const top = byCategory.reduce<CategoryFigures | null>((best, c) => (c.pinned > (best?.pinned ?? 0) ? c : best), null);
  const partial = monthOf(today) === month;

  return {
    month,
    partial,
    through: partial ? today : `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
    pinned: pinned.length,
    pinnedPrev: counted.filter((i) => monthOf(i.createdAt) === shiftMonth(month, -1)).length,
    fixed: fixed.length,
    confirmed: fixed.filter((i) => i.confirmedFixed > 0).length,
    medianDaysToFix: fixed.length ? median(days(fixed)) : null,
    byCategory,
    topCategory: top ? { category: top.category, pinned: top.pinned } : null,
    hidden: issues.filter((i) => i.hidden && inMonth(i.createdAt)).length,
  };
}

// ---------- events ----------

/** The New York calendar day of an event. */
export function eventDay(e: Pick<AnalyticsEvent, 'at'>) {
  return nyDate(e.at);
}

export function eventsInMonth<T extends Pick<AnalyticsEvent, 'at'>>(events: T[], month: string) {
  return events.filter((e) => monthOf(eventDay(e)) === month);
}

/** `n / d`, or null when there is nothing to divide by. */
export function rate(n: number, d: number) {
  return d > 0 ? n / d : null;
}

export interface FunnelRow {
  code: string;
  /** Null when the scan point no longer exists (its code is retired). */
  name: string | null;
  /** `scan_view` with `src=qr`: someone scanned the printed code. */
  qrScans: number;
  /** `scan_view` from anywhere else (a shared or typed link). */
  otherVisits: number;
  pinStarts: number;
  pinSubmits: number;
  /** +1s given on the scan page. */
  votes: number;
  /** New York day of the first QR scan in the data, to measure scans per week from then. */
  firstQrScan: string | null;
}

/** Which scan point a `vote` event came from: `source` is `scan:Q-12` (or plain `scan`). */
function voteScanCode(e: AnalyticsEvent, points: ScanPoint[]) {
  const source = e.props?.source;
  if (typeof source !== 'string' || !source.startsWith('scan')) return null;
  const code = source.split(':')[1];
  if (code) return code;
  // Older events without a code: attribute to the point that links this issue.
  return points.find((p) => p.issueId === e.issueId)?.code ?? null;
}

/** One funnel per scan point: QR scans → pins started → pins submitted, and +1s from the scan page. */
export function scanFunnels(events: AnalyticsEvent[], points: ScanPoint[]): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const row = (code: string) => {
    let r = rows.get(code);
    if (!r) {
      const point = points.find((p) => p.code === code);
      r = { code, name: point?.name ?? null, qrScans: 0, otherVisits: 0, pinStarts: 0, pinSubmits: 0, votes: 0, firstQrScan: null };
      rows.set(code, r);
    }
    return r;
  };
  points.forEach((p) => row(p.code));

  for (const e of events) {
    if (e.name === 'vote') {
      const code = voteScanCode(e, points);
      if (code) row(code).votes += 1;
      continue;
    }
    if (!e.scanCode) continue;
    if (e.name === 'scan_view') {
      if (e.props?.src === 'qr') {
        const r = row(e.scanCode);
        r.qrScans += 1;
        const day = eventDay(e);
        if (!r.firstQrScan || day < r.firstQrScan) r.firstQrScan = day;
      } else row(e.scanCode).otherVisits += 1;
    } else if (e.name === 'pin_start') row(e.scanCode).pinStarts += 1;
    else if (e.name === 'pin_submit') row(e.scanCode).pinSubmits += 1;
  }
  return [...rows.values()].sort((a, b) => b.qrScans - a.qrScans || a.code.localeCompare(b.code, 'en', { numeric: true }));
}

export function funnelTotals(rows: FunnelRow[]): Omit<FunnelRow, 'code' | 'name' | 'firstQrScan'> {
  return rows.reduce(
    (t, r) => ({
      qrScans: t.qrScans + r.qrScans,
      otherVisits: t.otherVisits + r.otherVisits,
      pinStarts: t.pinStarts + r.pinStarts,
      pinSubmits: t.pinSubmits + r.pinSubmits,
      votes: t.votes + r.votes,
    }),
    { qrScans: 0, otherVisits: 0, pinStarts: 0, pinSubmits: 0, votes: 0 },
  );
}

/**
 * QR scans per week for one poster, from its first scan (or `from`, if later) to `to`, both
 * inclusive. Null before the poster's first scan, so a new poster isn't shown as zero.
 */
export function scansPerWeek(row: Pick<FunnelRow, 'qrScans' | 'firstQrScan'>, from: string, to: string) {
  if (!row.firstQrScan) return null;
  const start = row.firstQrScan > from ? row.firstQrScan : from;
  const days = daysBetween(start, to) + 1;
  return (row.qrScans / days) * 7;
}

export const RESIDENT_EVENTS: { name: AnalyticsEventName; label: string }[] = [
  { name: 'map_view', label: 'Map opened' },
  { name: 'scan_view', label: 'Scan page opened' },
  { name: 'issue_view', label: 'Problem opened' },
  { name: 'pin_start', label: 'Pins started' },
  { name: 'pin_submit', label: 'Pins submitted' },
  { name: 'vote', label: '+1s' },
  { name: 'follow', label: 'Follows' },
  { name: 'comment', label: 'Comments' },
  { name: 'confirm_fix', label: 'Fix confirmations' },
];

/** Resident events by type, plus where pins started (QR vs map). */
export function residentActivity(events: AnalyticsEvent[]) {
  const counts = RESIDENT_EVENTS.map(({ name, label }) => ({ name, label, count: events.filter((e) => e.name === name).length }));
  const starts = events.filter((e) => e.name === 'pin_start');
  return {
    counts,
    pinStartsFromQr: starts.filter((e) => e.scanCode).length,
    pinStartsFromMap: starts.filter((e) => !e.scanCode).length,
    /** Days in the data with at least one resident event. */
    activeDays: new Set(events.filter((e) => !e.name.startsWith('staff_')).map(eventDay)).size,
  };
}

export interface ResponseSummary {
  /** Pins submitted in the window. */
  pins: number;
  /** ...that have had a staff action since. */
  responded: number;
  /** ...still waiting for the first staff action. */
  waiting: number;
  /** Hours from submit to first staff action, one per responded pin. */
  hours: number[];
  medianHours: number | null;
}

/**
 * Staff response time: from `pin_submit` to the first `staff_*` event on that issue.
 * A merge counts for the duplicate too (`staff_merge` carries it in `props.duplicate`).
 * `pins` are the submit events to measure; `allEvents` is searched for the staff actions,
 * so a pin from late in the month still finds a response from early next month.
 */
export function staffResponse(pins: AnalyticsEvent[], allEvents: AnalyticsEvent[]): ResponseSummary {
  const staff = allEvents.filter((e) => e.name.startsWith('staff_'));
  const hours: number[] = [];
  let waiting = 0;
  const submits = pins.filter((e) => e.name === 'pin_submit' && e.issueId);
  for (const pin of submits) {
    const t0 = Date.parse(pin.at);
    const first = staff
      .filter((e) => (e.issueId === pin.issueId || e.props?.duplicate === pin.issueId) && Date.parse(e.at) >= t0)
      .reduce<number | null>((min, e) => (min === null || Date.parse(e.at) < min ? Date.parse(e.at) : min), null);
    if (first === null) waiting += 1;
    else hours.push((first - t0) / 3_600_000);
  }
  return { pins: submits.length, responded: hours.length, waiting, hours, medianHours: hours.length ? median(hours) : null };
}

// ---------- thresholds ----------

export type ThresholdResult = 'unset' | 'no_data' | 'meets' | 'misses';

/** `value` is in the threshold's unit (percent as 0–100, not a fraction). */
export function checkThreshold(value: number | null, t: Threshold): ThresholdResult {
  if (t.value === null) return 'unset';
  if (value === null) return 'no_data';
  return (t.direction === 'at_least' ? value >= t.value : value <= t.value) ? 'meets' : 'misses';
}
