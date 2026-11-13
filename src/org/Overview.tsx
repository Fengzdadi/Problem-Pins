import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { SampleBadge, StatusTag } from '../components/ui';
import { CATEGORIES, STATUSES, STATUS_ORDER } from '../data/meta';
import { daysBetween, shortDate, today } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { ActionButton, attentionFor, attentionReason, attentionRule } from './actions';
import { RANGES, formatDays, overviewMetrics, periodLabel, type RangeDays } from './metrics';

export default function Overview() {
  const { issues, district } = useStore();
  const [range, setRange] = useState<RangeDays>(7);

  const m = useMemo(() => overviewMetrics(issues, today(), range), [issues, range]);
  const open = issues.filter((i) => i.status !== 'fixed');
  const attention = open.flatMap((i) => {
    const kind = attentionFor(i, district.rules);
    return kind ? [{ issue: i, kind }] : [];
  });
  const top = [...open].sort((a, b) => b.votes - a.votes).slice(0, 6);
  const maxCategory = Math.max(1, ...district.categories.map((c) => open.filter((i) => i.category === c).length));

  const since = shortDate(m.previous.to);
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const fixesBetter =
    m.fixes.medianDays !== null && m.fixes.previousMedianDays !== null && m.fixes.medianDays < m.fixes.previousMedianDays;

  const kpis = [
    {
      label: 'Open issues',
      value: m.open.now,
      note: !m.dataStart
        ? 'No pins yet'
        : m.noPrevious
          ? `All pinned since ${shortDate(m.dataStart)}`
          : m.open.change === 0
            ? `No change since ${since}`
            : `${m.open.change > 0 ? '+' : '−'}${Math.abs(m.open.change)} since ${since}`,
      tone: m.open.change > 0 && !m.noPrevious ? 'text-brand' : m.open.change < 0 ? 'text-emerald-700' : 'text-slate-500',
    },
    {
      label: 'New pins',
      value: m.newPins.count,
      note: m.newPins.count ? `${m.newPins.fromQr} from QR codes` : 'None in this period',
      tone: 'text-slate-500',
    },
    {
      label: 'Votes, last 7 days',
      value: m.votes.lastWeek,
      note: `across ${plural(m.votes.issues, 'issue')}${range !== 7 ? ' · not filtered by period' : ''}`,
      tone: 'text-slate-500',
    },
    {
      label: 'Median days to fix',
      value: m.fixes.medianDays === null ? '—' : formatDays(m.fixes.medianDays),
      note: !m.fixes.count
        ? 'No fixes in this period'
        : `from ${plural(m.fixes.count, 'fix', 'fixes')}${
            m.fixes.previousMedianDays !== null ? ` · ${formatDays(m.fixes.previousMedianDays)} the ${range} days before` : ''
          }`,
      tone: fixesBetter ? 'text-emerald-700' : 'text-slate-500',
    },
    {
      label: 'Confirmed by residents',
      value: m.confirmed.of ? `${Math.round((m.confirmed.count / m.confirmed.of) * 100)}%` : '—',
      note: m.confirmed.of ? `${m.confirmed.count} of ${plural(m.confirmed.of, 'fix', 'fixes')} in this period` : 'No fixes in this period',
      tone: 'text-slate-500',
    },
  ];

  const card = 'rounded-xl border border-slate-200 bg-white';

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 md:px-8 md:py-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-wider text-slate-500">{periodLabel(m.period)}</p>
          <h1 className="text-xl font-bold md:text-2xl">{district.name}</h1>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <SampleBadge />
          <div className="ml-auto flex rounded-lg bg-slate-200/70 p-0.5 text-sm sm:ml-0" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`rounded-md px-2.5 py-1 ${range === r ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>
      </header>

      <div>
        <div className={`${card} grid grid-cols-2 gap-px overflow-hidden bg-slate-200 sm:grid-cols-3 xl:grid-cols-5`}>
          {kpis.map((k) => (
            <div key={k.label} className="bg-white px-4 py-3.5 md:px-5 md:py-4">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className="mt-1 text-2xl font-bold md:text-3xl">{k.value}</p>
              <p className={`mt-1 text-xs ${k.tone}`}>{k.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {m.partial && m.dataStart
            ? `Pins only go back to ${shortDate(m.dataStart)}, so the last ${range} days aren’t fully covered yet. `
            : ''}
          The period applies to the figures above. Everything below shows issues as they are today.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <section className={card}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 md:px-5">
            <h2 className="font-semibold">Needs attention</h2>
            <span className="text-sm text-slate-500">{attention.length}</span>
          </div>
          {attention.map(({ issue, kind }) => (
            <div
              key={issue.id}
              onClick={() => navigate(`/org/issues/${issue.id}`)}
              className="flex cursor-pointer flex-col items-start gap-2 border-b border-slate-100 px-4 py-3.5 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 md:px-5"
            >
              <div className="w-full min-w-0 flex-1">
                <p className="sm:truncate">
                  <span className="mr-2 font-mono text-xs text-slate-400">{issue.id}</span>
                  <span className="font-semibold">{issue.title}</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-500 sm:truncate">{attentionReason(issue)}</p>
              </div>
              <ActionButton issue={issue} kind={kind} />
            </div>
          ))}
          {!attention.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing needs attention right now.</p>}
          <p className="px-4 py-3 text-xs text-slate-400 md:px-5">{attentionRule(district.rules)}</p>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 md:px-5">
            <h2 className="font-semibold">Where open issues are</h2>
            <span className="font-mono text-xs text-slate-500">{open.length} pins</span>
          </div>
          <div className="h-[230px] p-3">
            <div className="h-full overflow-hidden rounded-lg">
              <IssueMap issues={open} zoom={15} onSelect={(i) => navigate(`/org/issues/${i.id}`)} />
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-4 md:p-5`}>
          <h2 className="mb-3 font-semibold">Open issues by category</h2>
          {district.categories.map((c) => {
            const n = open.filter((i) => i.category === c).length;
            return (
              <div key={c} className="mb-2 flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 sm:w-28">{CATEGORIES[c].label}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div className="h-3 rounded" style={{ width: `${(n / maxCategory) * 100}%`, background: CATEGORIES[c].color }} />
                </div>
                <span className="w-6 text-right font-mono text-xs">{n}</span>
              </div>
            );
          })}
        </section>
        <section className={`${card} p-4 md:p-5`}>
          <h2 className="mb-3 font-semibold">All issues by status</h2>
          <div className="mb-4 flex h-3 overflow-hidden rounded">
            {STATUS_ORDER.map((s) => (
              <div key={s} style={{ flex: issues.filter((i) => i.status === s).length, background: STATUSES[s].color }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <StatusTag status={s} />
                <span className="font-mono text-xs">{issues.filter((i) => i.status === s).length}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={`${card} overflow-x-auto`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 md:px-5">
          <h2 className="font-semibold">Most-voted open issues</h2>
          <button onClick={() => navigate('/org/issues')} className="flex items-center gap-1 text-sm font-semibold text-brand">
            View all {open.length} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-slate-100 md:hidden">
          {top.map((i) => (
            <li key={i.id}>
              <button onClick={() => navigate(`/org/issues/${i.id}`)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                <span className="flex justify-between font-mono text-[11px] text-slate-400">
                  <span>{i.id}</span>
                  <span>{daysBetween(i.createdAt)}d open</span>
                </span>
                <span className="block font-medium">{i.title}</span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
                  <span>
                    <span className="font-semibold text-ink">{i.votes}</span> <span className="text-emerald-700">+{i.votesThisWeek}</span>
                  </span>
                  <StatusTag status={i.status} />
                  <span className={i.owner ? '' : 'font-medium text-brand'}>{i.owner ?? 'Unassigned'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="text-left font-mono text-[10px] tracking-wider text-slate-500">
              {['ID', 'ISSUE', 'LOCATION', 'VOTES', 'OPEN', 'OWNER', 'STATUS'].map((h) => (
                <th key={h} className="px-5 py-2 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((i) => (
              <tr
                key={i.id}
                onClick={() => navigate(`/org/issues/${i.id}`)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{i.id}</td>
                <td className="px-5 py-2.5 font-medium">{i.title}</td>
                <td className="px-5 py-2.5 text-slate-600">{i.locationLabel}</td>
                <td className="px-5 py-2.5">
                  <span className="font-semibold">{i.votes}</span>{' '}
                  <span className="text-xs text-emerald-700">+{i.votesThisWeek}</span>
                </td>
                <td className="px-5 py-2.5 text-slate-600">{daysBetween(i.createdAt)}d</td>
                <td className={`px-5 py-2.5 ${i.owner ? '' : 'font-medium text-brand'}`}>{i.owner ?? 'Unassigned'}</td>
                <td className="px-5 py-2.5">
                  <StatusTag status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
