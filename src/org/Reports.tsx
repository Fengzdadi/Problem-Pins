import { Fragment, useMemo } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { SampleBadge, labelClass, linkClass } from '../components/ui';
import { isDemo } from '../config';
import { CATEGORIES, STATUSES } from '../data/meta';
import type { Issue } from '../data/types';
import { downloadText, toCsv } from '../lib/csv';
import { EXPERIMENT_THRESHOLDS } from '../lib/experimentSettings';
import { daysBetween, plural, shortDate, today } from '../lib/format';
import { checkThreshold, monthLabel, monthOf, monthReport, reportMonths, shiftMonth, waitingByAgency } from '../lib/metrics';
import { navigate } from '../router';
import { useStore } from '../store';
import { cityFigures } from './dashboard';

const control = 'flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm';
// Category bars are one neutral color: color means status.
const bar = 'h-4 rounded bg-slate-400';
// The sheet's side padding, and the margin that lets a band of it run edge to edge on screen.
const gutter = 'px-5 md:px-8 print:px-3';
const bleed = '-mx-5 md:-mx-8 print:mx-0';

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
    toCsv(['id', 'title', 'category', 'status', 'neighbors', 'created', 'fixed', 'location', 'owner', '311 SR'], rows),
  );
}

/**
 * The monthly report: what the District Manager reads out at the board's monthly meeting and takes
 * to the District Service Cabinet. A document first, so it is laid out to print.
 */
/** `month` comes from the URL (`#/org/reports?month=2026-09`); anything else means the current month. */
export default function Reports({ month: wanted }: { month?: string | null }) {
  const { issues, hiddenIssues, district } = useStore();
  const now = today();
  const allIssues = useMemo(() => [...issues, ...hiddenIssues], [issues, hiddenIssues]);
  const months = useMemo(() => reportMonths(allIssues, now), [allIssues, now]);
  const month = wanted && months.includes(wanted) ? wanted : monthOf(now);
  const setMonth = (m: string) => navigate(m === monthOf(now) ? '/org/reports' : `/org/reports?month=${m}`);

  const r = monthReport(allIssues, month, now, district.categories);
  const name = monthLabel(month).split(' ')[0];
  const prevName = monthLabel(shiftMonth(month, -1)).split(' ')[0];
  const fixTarget = EXPERIMENT_THRESHOLDS.daysToFix.value;
  const fixResult = checkThreshold(r.medianDaysToFix, EXPERIMENT_THRESHOLDS.daysToFix);

  // Always as of today, whichever month is selected.
  const agencies = waitingByAgency(issues, now);
  const listed = agencies.reduce((n, a) => n + a.rows.length, 0);
  // The same count as the Overview and the sidebar: filed with 311 and still waiting.
  const waiting = cityFigures(issues, now).count;
  const notFiled = listed - waiting;
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
  if (waiting || notFiled)
    sentences.push(
      [
        waiting ? `Today ${plural(waiting, 'problem is', 'problems are')} waiting on the City` : '',
        notFiled ? `${waiting ? `${notFiled} more` : `Today ${notFiled}`} ${notFiled === 1 ? 'names' : 'name'} a City agency but ${notFiled === 1 ? 'is' : 'are'} not filed with 311 yet` : '',
      ]
        .filter(Boolean)
        .join('; ') + '.',
    );

  const figures: [label: string, value: string, note: string, tone?: string][] = [
    ['Problems pinned', String(r.pinned), r.partial ? `${r.pinnedPrev} in all of ${prevName}` : `${r.pinnedPrev} in ${prevName}`],
    ['Fixed', String(r.fixed), `${r.confirmed} confirmed by residents`],
    [
      'Median days to fix',
      r.medianDaysToFix === null ? '—' : r.medianDaysToFix.toFixed(1),
      r.medianDaysToFix === null ? 'nothing fixed this month' : fixTarget === null ? 'from pinned to marked fixed' : `target ${plural(fixTarget, 'day')}`,
      fixResult === 'misses' ? 'text-brand-dark' : undefined,
    ],
    [
      'Sent to the City',
      String(r.sentToCity),
      r.sentToCity === 0 ? 'no 311 requests this month' : r.sentStillWaiting === 0 ? 'none still waiting' : `${r.sentStillWaiting} still waiting`,
    ],
  ];

  const fixRows = r.byCategory.filter((c) => c.medianDaysToFix !== null);
  const maxDays = Math.max(1, ...fixRows.map((c) => c.medianDaysToFix!), fixTarget ?? 0) * 1.1;
  const pinRows = r.byCategory.filter((c) => c.pinned > 0);
  const maxPins = Math.max(1, ...pinRows.map((c) => c.pinned));

  return (
    <div className="pp-report mx-auto max-w-[1000px] space-y-5 px-4 py-5 md:px-8 md:py-7 print:p-0">
      {/* The app shell scrolls inside a box one screen high, which would print one page and cut the rest. */}
      <style>{`@media print {
        html, body, #root, #root :has(.pp-report) { display: block !important; height: auto !important; overflow: visible !important; background: white !important; }
      }`}</style>

      <header className="flex flex-wrap items-end justify-between gap-x-4">
        <div className="min-w-0">
          <p className={labelClass}>Monthly report</p>
          <h1 className="text-xl font-bold md:text-2xl">{monthLabel(month)}</h1>
        </div>
        <p className="w-full text-sm text-slate-600 xl:order-last">
          {district.name} · {r.partial ? `month in progress, figures up to ${shortDate(r.through)}` : `${shortDate(`${month}-01`)} to ${shortDate(r.through)}`}
        </p>
        <div className="mt-3 flex w-full flex-wrap items-center gap-2 xl:mt-0 xl:w-auto print:hidden">
          <SampleBadge />
          <select
            aria-label="Report month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium hover:border-slate-300 sm:flex-none"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            onClick={() => exportIssuesCsv(allIssues.filter((i) => !i.hidden))}
            className={`${control} border-slate-200 bg-white font-medium hover:border-slate-300`}
            title="Every issue, all months (hidden ones left out)"
          >
            <FileSpreadsheet className="h-4 w-4" /> Issues CSV
          </button>
          <button
            onClick={() => window.print()}
            className={`${control} flex-1 border-brand bg-brand font-semibold text-white hover:bg-brand-dark sm:flex-none`}
          >
            <Printer className="h-4 w-4" /> Print or save PDF
          </button>
        </div>
      </header>

      <article
        className="rounded-xl border border-slate-200 bg-white p-5 md:p-8 print:border-0 print:p-0"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <p className={labelClass}>Summary</p>
        <p className="mt-2 leading-relaxed md:text-lg">{sentences.join(' ')}</p>
        {r.hidden > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            {plural(r.hidden, 'pin')} that staff hid or the person who pinned {r.hidden === 1 ? 'it' : 'them'} removed {r.hidden === 1 ? 'is' : 'are'} left out of
            these figures.
          </p>
        )}

        <div className={`${bleed} mt-6 grid break-inside-avoid grid-cols-2 gap-px border-y border-slate-200 bg-slate-200 lg:grid-cols-4 print:grid-cols-4`}>
          {figures.map(([label, value, note, tone = 'text-slate-500']) => (
            <div key={label} className={`${gutter} bg-white py-4`}>
              <p className={labelClass}>{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums md:text-3xl">{value}</p>
              <p className={`mt-1 text-xs ${tone}`}>{note}</p>
            </div>
          ))}
        </div>

        <section className="mt-6 md:mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className={labelClass}>Waiting on the City, as of {shortDate(now)}</h2>
            {listed > 0 && <p className="text-xs text-slate-500">Grouped by agency · longest wait first</p>}
          </div>
          {listed === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing is waiting on the City.</p>
          ) : (
            <div className={`${bleed} mt-3 border-t border-slate-100`}>
              {agencies.map((a) => (
                <div key={a.agency} className="break-inside-avoid">
                  <div className={`${gutter} flex items-baseline gap-x-2 border-b border-slate-100 bg-slate-50 py-2`}>
                    <h3 className="text-sm font-semibold">{a.agency}</h3>
                    <span className="text-xs text-slate-500">{a.rows.length}</span>
                  </div>
                  {a.rows.map(({ issue: i, days }) => {
                    const req = i.cityRequest;
                    // Orange by the to-do list's rule: no contact with the City for `cityNoReplyDays` or more.
                    const late = req && daysBetween(req.lastFollowUp ?? req.sentOn, now) >= district.rules.cityNoReplyDays;
                    const tone = late ? 'text-brand-dark' : '';
                    const facts = req
                      ? [
                          <span className="font-mono text-xs">SR {req.sr}</span>,
                          plural(i.votes, 'neighbor'),
                          `sent ${shortDate(req.sentOn)}, ${req.lastFollowUp ? `last follow-up ${shortDate(req.lastFollowUp)}` : 'no follow-up yet'}`,
                        ]
                      : ['Not filed with 311 yet', plural(i.votes, 'neighbor'), `pinned ${shortDate(i.createdAt)}`];
                    return (
                      <a
                        key={i.id}
                        href={`#/org/issues/${i.id}`}
                        className={`${gutter} flex flex-col border-b border-slate-100 py-3 -outline-offset-2 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4`}
                      >
                        <div className="min-w-0 flex-1">
                          <p>
                            <span className="mr-2 font-mono text-xs text-slate-500">{i.id}</span>
                            <span className="font-semibold">{i.title}</span>
                          </p>
                          <p className={`text-sm font-semibold sm:hidden ${tone}`}>Waiting {plural(days, 'day')}</p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {facts.map((fact, n) => (
                              <Fragment key={n}>
                                <span className="whitespace-nowrap">
                                  {fact}
                                  {n < facts.length - 1 && ' ·'}
                                </span>{' '}
                              </Fragment>
                            ))}
                          </p>
                        </div>
                        <p className={`hidden w-[72px] shrink-0 text-right text-sm font-semibold tabular-nums sm:block ${tone}`}>{plural(days, 'day')}</p>
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 grid break-inside-avoid gap-8 md:mt-8 lg:grid-cols-[1fr_300px] lg:gap-10 print:grid-cols-[1fr_240px]">
          <div className="space-y-6">
            <div>
              <p className={`${labelClass} mb-3`}>Pins by category</p>
              {pinRows.length === 0 ? (
                <p className="text-sm text-slate-500">No pins this month.</p>
              ) : (
                pinRows.map((c) => (
                  <div key={c.category} className="mb-2 flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0">{CATEGORIES[c.category].label}</span>
                    <div className="h-4 flex-1">
                      <div className={bar} style={{ width: `${(c.pinned / maxPins) * 100}%` }} />
                    </div>
                    <span className="w-20 shrink-0 tabular-nums">{c.pinned}</span>
                  </div>
                ))
              )}
            </div>

            <div>
              <p className={`${labelClass} mb-3`}>Median days to fix, by category</p>
              {fixRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing was marked fixed in {name}, so there is no time to fix yet.</p>
              ) : (
                <>
                  {fixRows.map((c) => (
                    <div key={c.category} className="mb-2 flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0">{CATEGORIES[c.category].label}</span>
                      <div className="relative h-4 flex-1">
                        <div className={bar} style={{ width: `${(c.medianDaysToFix! / maxDays) * 100}%` }} />
                        {fixTarget !== null && (
                          <div
                            className="absolute -bottom-1.5 -top-1.5 border-l border-dashed border-slate-500"
                            style={{ left: `${(fixTarget / maxDays) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className="w-20 shrink-0 tabular-nums">
                        {c.medianDaysToFix!.toFixed(1)} <span className="text-xs text-slate-500">n={c.fixed}</span>
                      </span>
                    </div>
                  ))}
                  <p className="ml-[7.75rem] text-xs text-slate-500">
                    {fixTarget !== null ? `dashed line = ${fixTarget}-day target · ` : ''}n = problems fixed this month
                  </p>
                </>
              )}
            </div>
          </div>

          <div>
            <p className={`${labelClass} mb-3`}>In residents’ words</p>
            {quotes.length === 0 && <p className="text-sm text-slate-500">No resident comments in {name}.</p>}
            {quotes.map(({ u, i }) => (
              <blockquote key={u.id} className="mb-4 border-l-2 border-slate-300 pl-3 text-sm last:mb-0">
                “{u.text}”
                <footer className="mt-1 text-xs text-slate-500">
                  {u.author} · {shortDate(u.date)} · {plural(i.votes, 'neighbor')} on this issue
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </article>

      {isDemo && (
        <p className="text-sm text-slate-500 print:hidden">
          <a href="#/org/experiments" className={linkClass}>
            Experiment results
          </a>
          , for the Problem Pins team
        </p>
      )}
    </div>
  );
}
