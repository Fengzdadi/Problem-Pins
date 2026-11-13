import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Link } from 'lucide-react';
import { SampleBadge } from '../components/ui';
import { CATEGORIES, STATUSES } from '../data/meta';
import type { AnalyticsEvent, Issue } from '../data/types';
import { downloadText, toCsv } from '../lib/csv';
import { EXPERIMENT_THRESHOLDS, type Threshold, type ThresholdKey } from '../lib/experimentSettings';
import { daysBetween, shortDate, today } from '../lib/format';
import {
  checkThreshold,
  daysInMonth,
  eventDay,
  eventsInMonth,
  funnelTotals,
  monthLabel,
  monthOf,
  monthReport,
  rate,
  reportMonths,
  residentActivity,
  scanFunnels,
  scansPerWeek,
  shiftMonth,
  staffResponse,
} from '../lib/metrics';
import { navigate } from '../router';
import { useStore } from '../store';

const section = 'font-mono text-[10px] tracking-wider text-slate-500';
const RESIDENT_ACTIONS = new Set(['pin_submit', 'vote', 'follow', 'comment', 'confirm_fix']);

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function pct(r: number | null) {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}

function hours(h: number | null) {
  if (h === null) return '—';
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}

function exportIssuesCsv(issues: Issue[]) {
  const rows = [...issues]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((i) => [
      i.id,
      i.title,
      CATEGORIES[i.category].label,
      STATUSES[i.status].label,
      i.votes,
      i.createdAt,
      i.fixedOn ?? '',
      [i.locationLabel, i.locationDetail].filter(Boolean).join(', '),
      i.owner ?? '',
      i.cityRequest?.sr ?? '',
    ]);
  downloadText(
    `problem-pins-issues-${today()}.csv`,
    toCsv(['id', 'title', 'category', 'status', 'votes', 'created', 'fixed', 'location', 'owner', '311 SR'], rows),
  );
}

export default function Reports() {
  const store = useStore();
  const { issues, hiddenIssues, toast, district } = store;
  const now = today();
  const allIssues = useMemo(() => [...issues, ...hiddenIssues], [issues, hiddenIssues]);
  const months = useMemo(() => reportMonths(allIssues, now), [allIssues, now]);
  const [month, setMonth] = useState(monthOf(now));
  const [events, setEvents] = useState<AnalyticsEvent[] | null>(null);

  useEffect(() => {
    void store.listEvents().then(setEvents);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = monthReport(allIssues, month, now, district.categories);
  const name = monthLabel(month).split(' ')[0];
  const prevName = monthLabel(shiftMonth(month, -1)).split(' ')[0];
  const monthEvents = events ? eventsInMonth(events, month) : null;
  const residentActions = monthEvents?.filter((e) => RESIDENT_ACTIONS.has(e.name)).length ?? null;
  const fixTarget = EXPERIMENT_THRESHOLDS.daysToFix.value;

  const waiting = issues
    .filter((i) => i.status === 'sent_to_city' || (i.agency && !i.cityRequest && i.status !== 'fixed'))
    .sort((a, b) => daysBetween(b.cityRequest?.sentOn ?? b.createdAt) - daysBetween(a.cityRequest?.sentOn ?? a.createdAt));
  const quotes = issues
    .flatMap((i) => i.updates.filter((u) => u.role === 'resident' && !u.mine && monthOf(u.date) === month).map((u) => ({ u, i })))
    .slice(0, 2);

  // The summary only states what the figures show.
  const sentences: string[] = [];
  if (r.pinned === 0) sentences.push(`No problems were pinned in ${name}${r.partial ? ' so far' : ''}.`);
  else {
    let s = `Residents pinned ${plural(r.pinned, 'problem')} in ${name}${r.partial ? ` up to ${shortDate(r.through)}` : ''}`;
    if (r.partial) s += `, against ${r.pinnedPrev} in all of ${prevName}`;
    else if (r.pinnedPrev > 0 || r.pinned > 0) {
      const diff = r.pinned - r.pinnedPrev;
      s += diff === 0 ? `, the same as in ${prevName}` : `, ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than in ${prevName}`;
    }
    sentences.push(`${s}.`);
  }
  if (r.fixed === 0) sentences.push(`No problems were marked fixed in ${name}${r.partial ? ' yet' : ''}.`);
  else
    sentences.push(
      `Staff marked ${r.fixed} fixed, and residents confirmed ${r.confirmed === 0 ? 'none' : r.confirmed === r.fixed ? (r.fixed === 1 ? 'it' : 'all of them') : `${r.confirmed}`}${r.confirmed > 0 && r.confirmed < r.fixed ? ' of those fixes' : ''}${r.confirmed === 0 ? ' yet' : ''}.`,
    );
  if (r.topCategory && r.pinned > 1)
    sentences.push(`${CATEGORIES[r.topCategory.category].label} was the most common category (${r.topCategory.pinned} of ${r.pinned}).`);
  if (waiting.length) sentences.push(`Today ${plural(waiting.length, 'problem is', 'problems are')} waiting on the City.`);

  const kpis: [string, string, string][] = [
    ['Problems pinned', String(r.pinned), r.partial ? `${r.pinnedPrev} in all of ${prevName}` : `${r.pinnedPrev} in ${prevName}`],
    ['Fixed', String(r.fixed), `${r.confirmed} confirmed by residents`],
    [
      'Median days to fix',
      r.medianDaysToFix === null ? '—' : r.medianDaysToFix.toFixed(1),
      r.medianDaysToFix === null ? 'nothing fixed this month' : fixTarget === null ? 'target: set by the team' : `target: ${fixTarget}`,
    ],
    ['Resident actions', residentActions === null ? '…' : String(residentActions), 'pins, +1s, follows, comments, confirmations'],
  ];

  const fixRows = r.byCategory.filter((c) => c.medianDaysToFix !== null);
  const maxDays = Math.max(1, ...fixRows.map((c) => c.medianDaysToFix!), fixTarget ?? 0) * 1.1;
  const pinRows = r.byCategory.filter((c) => c.pinned > 0);
  const maxPins = Math.max(1, ...pinRows.map((c) => c.pinned));

  return (
    <div className="mx-auto max-w-[1060px] px-8 py-7">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className={`${section} text-[11px]`}>REPORTS / MONTHLY</p>
          <h1 className="text-2xl font-bold">{monthLabel(month)} report</h1>
          <p className="text-sm text-slate-600">
            {district.name} · {r.partial ? `month in progress, figures up to ${shortDate(r.through)}` : `${shortDate(`${month}-01`)} to ${shortDate(r.through)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap print:hidden">
          <SampleBadge />
          <select
            aria-label="Report month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            onClick={() => exportIssuesCsv(allIssues.filter((i) => !i.hidden))}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium"
            title="Every problem, all months (hidden ones left out)"
          >
            <FileSpreadsheet className="h-4 w-4" /> Issues CSV
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              toast('Report link copied');
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium"
          >
            <Link className="h-4 w-4" /> Copy link
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Download className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className={section}>SUMMARY</p>
        <p className="mt-2 text-lg leading-relaxed">{sentences.join(' ')}</p>
        {r.hidden > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            {plural(r.hidden, 'pin')} staff hid (spam or off-topic) {r.hidden === 1 ? 'is' : 'are'} left out of these figures.
          </p>
        )}

        <div className="mt-6 grid grid-cols-4 divide-x divide-slate-200 border-y border-slate-200 py-4">
          {kpis.map(([label, value, note]) => (
            <div key={label} className="px-4 first:pl-0">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-3xl font-bold">{value}</p>
              <p className="text-xs text-slate-500">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-[1fr_300px] gap-10">
          <div>
            <p className={`${section} mb-3`}>PINS BY CATEGORY</p>
            {pinRows.length === 0 ? (
              <p className="mb-6 text-sm text-slate-500">No pins this month.</p>
            ) : (
              <div className="mb-6">
                {pinRows.map((c) => (
                  <div key={c.category} className="mb-2 flex items-center gap-3 text-sm">
                    <span className="w-28">{CATEGORIES[c.category].label}</span>
                    <div className="h-4 flex-1">
                      <div className="h-4 rounded" style={{ width: `${(c.pinned / maxPins) * 100}%`, background: CATEGORIES[c.category].color }} />
                    </div>
                    <span className="w-10 font-mono text-xs">{c.pinned}</span>
                  </div>
                ))}
              </div>
            )}

            <p className={`${section} mb-3`}>MEDIAN DAYS TO FIX, BY CATEGORY</p>
            {fixRows.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing was marked fixed in {name}, so there is no time to fix yet.</p>
            ) : (
              <>
                {fixRows.map((c) => (
                  <div key={c.category} className="mb-2 flex items-center gap-3 text-sm">
                    <span className="w-28">{CATEGORIES[c.category].label}</span>
                    <div className="relative h-4 flex-1">
                      <div
                        className="h-4 rounded"
                        style={{ width: `${(c.medianDaysToFix! / maxDays) * 100}%`, background: CATEGORIES[c.category].color }}
                      />
                      {fixTarget !== null && (
                        <div
                          className="absolute -bottom-1.5 -top-1.5 border-l border-dashed border-slate-500"
                          style={{ left: `${(fixTarget / maxDays) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="w-16 font-mono text-xs">
                      {c.medianDaysToFix!.toFixed(1)} <span className="text-slate-400">n={c.fixed}</span>
                    </span>
                  </div>
                ))}
                <p className="ml-[7.75rem] font-mono text-[10px] text-slate-500">
                  {fixTarget !== null ? `dashed line = ${fixTarget}-day target · ` : ''}n = problems fixed this month
                </p>
              </>
            )}
          </div>
          <div>
            <p className={`${section} mb-3`}>IN RESIDENTS’ WORDS</p>
            {quotes.length === 0 && <p className="text-sm text-slate-500">No resident comments in {name}.</p>}
            {quotes.map(({ u, i }) => (
              <blockquote key={u.id} className="mb-4 border-l-2 border-brand pl-3 text-sm">
                “{u.text}”
                <footer className="mt-1 text-xs text-slate-500">
                  {u.author} · {shortDate(u.date)} · {i.votes} neighbors on this issue
                </footer>
              </blockquote>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className={`${section} mb-2 flex justify-between`}>
            <span>WAITING ON THE CITY · AS OF {shortDate(now).toUpperCase()}</span>
            <span className="font-sans tracking-normal">For the next community board discussion</span>
          </div>
          {waiting.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">Nothing is waiting on the City.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] text-slate-500">
                  <th className="py-2 font-normal">ID</th>
                  <th className="py-2 font-normal">ISSUE</th>
                  <th className="py-2 font-normal">AGENCY</th>
                  <th className="py-2 font-normal">VOTES</th>
                  <th className="py-2 font-normal">WAITING</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((i) => {
                  const days = daysBetween(i.cityRequest?.sentOn ?? i.createdAt);
                  return (
                    <tr
                      key={i.id}
                      onClick={() => navigate(`/org/issues/${i.id}`)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2.5 font-mono text-xs text-slate-500">{i.id}</td>
                      <td className="py-2.5">
                        {i.title}
                        {i.cityRequest ? ` · SR ${i.cityRequest.sr}` : ' · not yet sent'}
                      </td>
                      <td className="py-2.5">{i.agency}</td>
                      <td className="py-2.5">{i.votes}</td>
                      <td className={`py-2.5 font-mono text-xs ${days > district.rules.cityNoReplyDays ? 'text-brand' : ''}`}>
                        {days} days
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </article>

      <Experiments events={events} month={month} today={now} medianDaysToFix={r.medianDaysToFix} />
    </div>
  );
}

function Experiments({
  events,
  month,
  today: now,
  medianDaysToFix,
}: {
  events: AnalyticsEvent[] | null;
  month: string;
  today: string;
  medianDaysToFix: number | null;
}) {
  const { scanPoints } = useStore();
  const [scope, setScope] = useState<'month' | 'all'>('month');

  if (!events) {
    return (
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 print:hidden">
        <p className={section}>EXPERIMENTS</p>
        <p className="mt-2 text-sm text-slate-500">Loading events…</p>
      </section>
    );
  }

  const windowEvents = scope === 'month' ? eventsInMonth(events, month) : events;
  const from = scope === 'month' ? `${month}-01` : events.length ? eventDay(events[0]) : now;
  const to = scope === 'month' && monthOf(now) !== month ? `${month}-${daysInMonth(month)}` : now;
  const rows = scanFunnels(windowEvents, scanPoints);
  const totals = funnelTotals(rows);
  const activity = residentActivity(windowEvents);
  const response = staffResponse(windowEvents, events);
  const weekly = rows.filter((x) => scanPoints.some((p) => p.code === x.code)).map((x) => scansPerWeek(x, from, to));
  const weeklyKnown = weekly.filter((w): w is number => w !== null);
  const r = {
    scanToPinStart: rate(totals.pinStarts, totals.qrScans),
    pinStartToSubmit: rate(totals.pinSubmits, totals.pinStarts),
    scanToVote: rate(totals.votes, totals.qrScans),
  };

  const metricValues: Record<ThresholdKey, { value: number | null; shown: string }> = {
    scanToPinStart: { value: r.scanToPinStart === null ? null : r.scanToPinStart * 100, shown: pct(r.scanToPinStart) },
    pinStartToSubmit: { value: r.pinStartToSubmit === null ? null : r.pinStartToSubmit * 100, shown: pct(r.pinStartToSubmit) },
    scanToVote: { value: r.scanToVote === null ? null : r.scanToVote * 100, shown: pct(r.scanToVote) },
    scansPerPointPerWeek: (() => {
      const v = weeklyKnown.length ? weeklyKnown.reduce((a, b) => a + b, 0) / weeklyKnown.length : null;
      return { value: v, shown: v === null ? '—' : v.toFixed(1) };
    })(),
    staffResponseHours: { value: response.medianHours, shown: hours(response.medianHours) },
    daysToFix: {
      value: medianDaysToFix,
      shown: medianDaysToFix === null ? '—' : `${medianDaysToFix.toFixed(1)} days (${monthLabel(month).split(' ')[0]})`,
    },
  };

  const exportEvents = () => {
    const keys = [...new Set(events.flatMap((e) => Object.keys(e.props ?? {})))].sort();
    downloadText(
      `problem-pins-events-${now}.csv`,
      toCsv(
        ['at', 'ny_date', 'name', 'issue_id', 'scan_code', ...keys.map((k) => `props.${k}`)],
        events.map((e) => [e.at, eventDay(e), e.name, e.issueId, e.scanCode, ...keys.map((k) => (e.props?.[k] ?? null) as string | number | null)]),
      ),
    );
  };

  const th = 'py-2 font-normal';
  const tab = (active: boolean) => `rounded-md px-2.5 py-1 text-xs font-medium ${active ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 print:hidden">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={section}>EXPERIMENTS · STAFF ONLY, NOT IN THE PDF</p>
          <h2 className="mt-1 text-xl font-bold">QR posters and response time</h2>
          <p className="mt-1 max-w-[640px] text-sm text-slate-600">
            Counted from app events, which carry no identity: these are counts of actions, not of people. A person who scans twice
            counts twice. {scope === 'month' ? `${shortDate(from)} to ${shortDate(to)}.` : `All events, ${shortDate(from)} to ${shortDate(to)}.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button className={tab(scope === 'month')} onClick={() => setScope('month')}>
              {monthLabel(month).split(' ')[0]}
            </button>
            <button className={tab(scope === 'all')} onClick={() => setScope('all')}>
              All time
            </button>
          </div>
          <button
            onClick={exportEvents}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium"
          >
            <FileSpreadsheet className="h-4 w-4" /> Events CSV
          </button>
        </div>
      </div>

      <p className={`${section} mb-2 mt-6`}>FUNNEL BY POSTER</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left font-mono text-[10px] text-slate-500">
            <th className={th}>POSTER</th>
            <th className={`${th} text-right`}>QR SCANS</th>
            <th className={`${th} text-right`}>PINS STARTED</th>
            <th className={`${th} text-right`}>SUBMITTED</th>
            <th className={`${th} text-right`}>+1 ON SCAN PAGE</th>
            <th className={`${th} text-right`}>SCANS / WEEK</th>
            <th className={`${th} text-right`}>OTHER VISITS</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-slate-500">
                No scan points yet.
              </td>
            </tr>
          )}
          {rows.map((x) => {
            const w = scansPerWeek(x, from, to);
            return (
              <tr key={x.code} className="border-b border-slate-100">
                <td className="py-2.5">
                  <span className="font-mono text-xs text-slate-500">{x.code}</span> {x.name ?? <span className="text-slate-500">retired</span>}
                </td>
                <td className="py-2.5 text-right font-semibold">{x.qrScans}</td>
                <Cell n={x.pinStarts} of={x.qrScans} />
                <Cell n={x.pinSubmits} of={x.pinStarts} />
                <Cell n={x.votes} of={x.qrScans} />
                <td className="py-2.5 text-right font-mono text-xs">{w === null ? '—' : w.toFixed(1)}</td>
                <td className="py-2.5 text-right text-slate-500">{x.otherVisits}</td>
              </tr>
            );
          })}
          {rows.length > 1 && (
            <tr className="font-semibold">
              <td className="py-2.5">All posters</td>
              <td className="py-2.5 text-right">{totals.qrScans}</td>
              <Cell n={totals.pinStarts} of={totals.qrScans} />
              <Cell n={totals.pinSubmits} of={totals.pinStarts} />
              <Cell n={totals.votes} of={totals.qrScans} />
              <td />
              <td className="py-2.5 text-right text-slate-500">{totals.otherVisits}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        Pins started counts every pin opened from a poster’s scan page (QR or shared link). Percentages: started ÷ QR scans,
        submitted ÷ started, +1 ÷ QR scans.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-10">
        <div>
          <p className={`${section} mb-2`}>RESIDENT ACTIVITY</p>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            {activity.counts.map((c) => (
              <div key={c.name} className="contents">
                <dt className="text-slate-600">{c.label}</dt>
                <dd className="text-right font-mono">{c.count}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            Pins started from a poster: {activity.pinStartsFromQr} · from the map: {activity.pinStartsFromMap} ·{' '}
            {plural(activity.activeDays, 'day')} with activity
          </p>
        </div>
        <div>
          <p className={`${section} mb-2`}>STAFF RESPONSE TIME</p>
          <p className="text-3xl font-bold">{hours(response.medianHours)}</p>
          <p className="text-sm text-slate-600">median from a pin being submitted to the first staff action on it</p>
          <p className="mt-2 text-sm text-slate-600">
            {plural(response.pins, 'pin')} submitted in this window · {response.responded} with a staff action ·{' '}
            {response.waiting} still waiting
          </p>
          {response.hours.length > 0 && (
            <p className="mt-1 font-mono text-xs text-slate-500">
              fastest {hours(Math.min(...response.hours))} · slowest {hours(Math.max(...response.hours))}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            A staff action is any update, status change, assignment, 311 filing, nudge, hide or merge.
          </p>
        </div>
      </div>

      <p className={`${section} mb-2 mt-6`}>THRESHOLDS</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left font-mono text-[10px] text-slate-500">
            <th className={th}>METRIC</th>
            <th className={`${th} text-right`}>NOW</th>
            <th className={`${th} text-right`}>THRESHOLD</th>
            <th className={`${th} text-right`}>RESULT</th>
          </tr>
        </thead>
        <tbody>
          {(Object.entries(EXPERIMENT_THRESHOLDS) as [ThresholdKey, Threshold][]).map(([key, t]) => {
            const m = metricValues[key];
            const result = checkThreshold(m.value, t);
            return (
              <tr key={key} className="border-b border-slate-100">
                <td className="py-2.5">{t.label}</td>
                <td className="py-2.5 text-right font-mono text-xs">{m.shown}</td>
                <td className="py-2.5 text-right text-xs">
                  {t.value === null ? (
                    <span className="text-slate-500">set by the team</span>
                  ) : (
                    <span className="font-mono">
                      {t.direction === 'at_least' ? '≥' : '≤'} {t.value}
                      {t.unit === 'percent' ? '%' : t.unit === 'count' ? '' : ` ${t.unit}`}
                    </span>
                  )}
                </td>
                <td
                  className={`py-2.5 text-right font-mono text-[10px] tracking-wider ${result === 'misses' ? 'text-brand' : result === 'meets' ? 'text-[#2e8b57]' : 'text-slate-400'}`}
                >
                  {result === 'unset' ? '—' : result === 'no_data' ? 'NO DATA' : result === 'meets' ? 'MEETS' : 'MISSES'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        Thresholds live in <span className="font-mono">src/lib/experimentSettings.ts</span>. The team sets each one, with its
        reasoning, before reading the results.
      </p>
    </section>
  );
}

function Cell({ n, of }: { n: number; of: number }) {
  return (
    <td className="py-2.5 text-right">
      {n} <span className="ml-1 font-mono text-xs text-slate-500">{pct(rate(n, of))}</span>
    </td>
  );
}
