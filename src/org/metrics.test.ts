import { describe, expect, it } from 'vitest';
import type { Issue } from '../data/types';
import { SAMPLE_ISSUES } from '../data/sampleData';
import { isOpenOn, overviewMetrics, periodEnding, periodLabel, previousPeriod } from './metrics';

function issue(fields: Partial<Issue>): Issue {
  return {
    id: 'PP-1',
    title: 't',
    description: '',
    category: 'litter',
    status: 'open',
    lat: 0,
    lng: 0,
    locationLabel: '',
    votes: 1,
    votesThisWeek: 0,
    createdAt: '2026-10-01',
    owner: null,
    photos: [],
    updates: [],
    history: [],
    via: 'Map · problempins.org',
    following: 0,
    duplicatesMerged: 0,
    confirmedFixed: 0,
    ...fields,
  };
}

describe('periods', () => {
  it('counts the end date and goes back days - 1', () => {
    expect(periodEnding('2026-10-14', 7)).toEqual({ from: '2026-10-08', to: '2026-10-14', days: 7 });
    expect(previousPeriod(periodEnding('2026-10-14', 7))).toEqual({ from: '2026-10-01', to: '2026-10-07', days: 7 });
  });

  it('labels a period, with both years when it spans New Year', () => {
    expect(periodLabel(periodEnding('2026-10-14', 7))).toBe('OCT 8 – OCT 14, 2026');
    expect(periodLabel(periodEnding('2027-01-03', 7))).toBe('DEC 28, 2026 – JAN 3, 2027');
  });
});

describe('isOpenOn', () => {
  it('is open from the day it was pinned until the day it was fixed', () => {
    const fixed = issue({ createdAt: '2026-10-01', status: 'fixed', fixedOn: '2026-10-05' });
    expect(isOpenOn(fixed, '2026-09-30')).toBe(false);
    expect(isOpenOn(fixed, '2026-10-01')).toBe(true);
    expect(isOpenOn(fixed, '2026-10-04')).toBe(true);
    expect(isOpenOn(fixed, '2026-10-05')).toBe(false);
  });

  it('treats a fixed issue without a date as already fixed', () => {
    expect(isOpenOn(issue({ status: 'fixed' }), '2026-10-10')).toBe(false);
  });

  it('counts sent-to-City and scheduled issues as open', () => {
    expect(isOpenOn(issue({ status: 'sent_to_city' }), '2026-10-10')).toBe(true);
    expect(isOpenOn(issue({ status: 'scheduled' }), '2026-10-10')).toBe(true);
  });
});

describe('overviewMetrics', () => {
  const issues = [
    issue({ id: 'a', createdAt: '2026-09-01', status: 'fixed', fixedOn: '2026-09-11', confirmedFixed: 2 }), // 10 days, previous period
    issue({ id: 'b', createdAt: '2026-10-02', status: 'fixed', fixedOn: '2026-10-10', confirmedFixed: 1 }), // 8 days
    issue({ id: 'c', createdAt: '2026-10-05', status: 'fixed', fixedOn: '2026-10-14' }), // 9 days, unconfirmed
    issue({ id: 'd', createdAt: '2026-10-09', votesThisWeek: 4, via: 'QR · noticeboard Q-12' }),
    issue({ id: 'e', createdAt: '2026-10-13', votesThisWeek: 1 }),
    issue({ id: 'f', createdAt: '2026-09-20', status: 'sent_to_city', cityRequest: { sr: '311-1', agency: 'DOT', routedTo: 'DOT', sentOn: '2026-10-12', sentBy: 'M' } }),
  ];

  it('computes the 7-day figures', () => {
    const m = overviewMetrics(issues, '2026-10-14', 7);
    // Open on Oct 7: b, c, f. Open now: d, e, f.
    expect(m.open).toEqual({ now: 3, atStart: 3, change: 0 });
    expect(m.newPins).toEqual({ count: 2, fromQr: 1 });
    expect(m.votes).toEqual({ lastWeek: 5, issues: 2 });
    expect(m.fixes.count).toBe(2);
    expect(m.fixes.medianDays).toBe(8.5);
    expect(m.fixes.previousCount).toBe(0);
    expect(m.fixes.previousMedianDays).toBeNull();
    expect(m.confirmed).toEqual({ count: 1, of: 2 });
    expect(m.sentToCity).toBe(1);
    expect(m.partial).toBe(false);
    expect(m.noPrevious).toBe(false);
  });

  it('widens with the range and compares with the period before', () => {
    const m = overviewMetrics(issues, '2026-10-14', 30); // Sep 15 – Oct 14, previous Aug 16 – Sep 14
    expect(m.newPins.count).toBe(5);
    expect(m.fixes.count).toBe(2);
    expect(m.fixes.previousMedianDays).toBe(10);
    expect(m.open.atStart).toBe(0);
  });

  it('flags periods the data does not cover', () => {
    const m = overviewMetrics(issues, '2026-10-14', 90);
    expect(m.dataStart).toBe('2026-09-01');
    expect(m.partial).toBe(true);
    expect(m.noPrevious).toBe(true);
  });

  it('handles no issues at all', () => {
    const m = overviewMetrics([], '2026-10-14', 7);
    expect(m.open).toEqual({ now: 0, atStart: 0, change: 0 });
    expect(m.fixes.medianDays).toBeNull();
    expect(m.dataStart).toBeNull();
    expect(m.noPrevious).toBe(true);
  });

  it('changes when an issue is marked fixed today', () => {
    const before = overviewMetrics(SAMPLE_ISSUES, '2026-10-14', 7);
    const target = SAMPLE_ISSUES.find((i) => i.status === 'open')!;
    const after = overviewMetrics(
      SAMPLE_ISSUES.map((i) => (i.id === target.id ? { ...i, status: 'fixed' as const, fixedOn: '2026-10-14' } : i)),
      '2026-10-14',
      7,
    );
    expect(after.open.now).toBe(before.open.now - 1);
    expect(after.fixes.count).toBe(before.fixes.count + 1);
    expect(after.fixes.medianDays).not.toBeNull();
  });
});
