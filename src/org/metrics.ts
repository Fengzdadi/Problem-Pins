import type { Issue } from '../data/types';
import { addDays, daysBetween, median, shortDate } from '../lib/format';

/**
 * Overview figures, computed from the issues alone. Pure (pass `today` in), so it is tested
 * in `metrics.test.ts` and behaves the same in demo (frozen date) and live mode.
 *
 * Votes are the one exception to the period filter: the contract only exposes
 * `votesThisWeek`, so the votes figure is always the last 7 days.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

/** `days` calendar days ending on `to` (inclusive), dates as `YYYY-MM-DD`. */
export interface Period {
  from: string;
  to: string;
  days: number;
}

export function periodEnding(to: string, days: number): Period {
  return { from: addDays(to, -(days - 1)), to, days };
}

/** The period of the same length right before `p`. */
export function previousPeriod(p: Period): Period {
  return periodEnding(addDays(p.from, -1), p.days);
}

export function inPeriod(date: string | undefined, p: Period) {
  return Boolean(date) && date! >= p.from && date! <= p.to;
}

/** Open at the end of `date`: pinned by then and not yet fixed. Fixed issues with no date count as fixed. */
export function isOpenOn(issue: Issue, date: string) {
  if (issue.createdAt > date) return false;
  if (issue.status !== 'fixed') return true;
  return Boolean(issue.fixedOn && issue.fixedOn > date);
}

export function openOn(issues: Issue[], date: string) {
  return issues.filter((i) => isOpenOn(i, date)).length;
}

/** Fixes that happened in the period, with how many days each took. */
export function fixesIn(issues: Issue[], p: Period) {
  return issues
    .filter((i) => i.status === 'fixed' && inPeriod(i.fixedOn, p))
    .map((i) => ({ issue: i, days: daysBetween(i.createdAt, i.fixedOn!) }));
}

export function earliestPin(issues: Issue[]) {
  return issues.reduce<string | null>((min, i) => (!min || i.createdAt < min ? i.createdAt : min), null);
}

export function formatDays(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "OCT 8 – OCT 14, 2026" (years shown on both ends when they differ). */
export function periodLabel(p: Period) {
  const [fy] = p.from.split('-');
  const [ty] = p.to.split('-');
  const from = fy === ty ? shortDate(p.from) : `${shortDate(p.from)}, ${fy}`;
  return `${from} – ${shortDate(p.to)}, ${ty}`.toUpperCase();
}

export interface OverviewMetrics {
  period: Period;
  previous: Period;
  /** Earliest pin we have, or null when there are no issues. */
  dataStart: string | null;
  /** True when the data starts after the period does, so the period isn't fully covered. */
  partial: boolean;
  /** True when there is no data at all in the previous period, so comparisons are meaningless. */
  noPrevious: boolean;
  open: { now: number; atStart: number; change: number };
  newPins: { count: number; fromQr: number };
  votes: { lastWeek: number; issues: number };
  fixes: { count: number; medianDays: number | null; previousCount: number; previousMedianDays: number | null };
  confirmed: { count: number; of: number };
  sentToCity: number;
}

export function overviewMetrics(issues: Issue[], today: string, days: number): OverviewMetrics {
  const period = periodEnding(today, days);
  const previous = previousPeriod(period);
  const dataStart = earliestPin(issues);
  const fixes = fixesIn(issues, period);
  const prevFixes = fixesIn(issues, previous);
  const openNow = openOn(issues, today);
  const openAtStart = openOn(issues, previous.to);
  const created = issues.filter((i) => inPeriod(i.createdAt, period));

  return {
    period,
    previous,
    dataStart,
    partial: Boolean(dataStart && dataStart > period.from),
    noPrevious: !dataStart || dataStart > previous.to,
    open: { now: openNow, atStart: openAtStart, change: openNow - openAtStart },
    newPins: { count: created.length, fromQr: created.filter((i) => i.via.startsWith('QR')).length },
    votes: {
      lastWeek: issues.reduce((a, i) => a + i.votesThisWeek, 0),
      issues: issues.filter((i) => i.votesThisWeek > 0).length,
    },
    fixes: {
      count: fixes.length,
      medianDays: fixes.length ? median(fixes.map((f) => f.days)) : null,
      previousCount: prevFixes.length,
      previousMedianDays: prevFixes.length ? median(prevFixes.map((f) => f.days)) : null,
    },
    confirmed: { count: fixes.filter((f) => f.issue.confirmedFixed > 0).length, of: fixes.length },
    sentToCity: issues.filter((i) => inPeriod(i.cityRequest?.sentOn, period)).length,
  };
}
