import { useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { SampleBadge, StatusTag } from '../components/ui';
import { CATEGORIES, CATEGORY_ORDER, STATUSES, STATUS_ORDER } from '../data/meta';
import { daysBetween } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { ActionButton, attentionFor, attentionReason, attentionRule } from './actions';

export default function Overview() {
  const { issues, toast, district } = useStore();
  const [range, setRange] = useState('7 days');

  const open = issues.filter((i) => i.status !== 'fixed');
  const thisWeek = issues.filter((i) => daysBetween(i.createdAt) <= 7);
  const votesThisWeek = issues.reduce((a, i) => a + i.votesThisWeek, 0);
  const fixed = issues.filter((i) => i.status === 'fixed');
  const confirmed = fixed.filter((i) => i.confirmedFixed > 0);
  const attention = open.flatMap((i) => {
    const kind = attentionFor(i, district.rules);
    return kind ? [{ issue: i, kind }] : [];
  });
  const top = [...open].sort((a, b) => b.votes - a.votes).slice(0, 6);
  const maxCategory = Math.max(1, ...CATEGORY_ORDER.map((c) => open.filter((i) => i.category === c).length));

  const kpis = [
    { label: 'Open issues', value: open.length, note: `+${thisWeek.length} since last week`, tone: 'text-brand' },
    { label: 'New pins this week', value: thisWeek.length, note: 'from residents and QR codes', tone: 'text-slate-500' },
    { label: 'Votes this week', value: votesThisWeek, note: `across ${issues.filter((i) => i.votesThisWeek).length} issues`, tone: 'text-slate-500' },
    { label: 'Median days to fix', value: '8.5', note: 'down from 11.0 in Sep', tone: 'text-emerald-700' },
    {
      label: 'Confirmed by residents',
      value: fixed.length ? `${Math.round((confirmed.length / fixed.length) * 100)}%` : '—',
      note: `${confirmed.length} of ${fixed.length} fixes`,
      tone: 'text-slate-500',
    },
  ];

  const card = 'rounded-xl border border-slate-200 bg-white';

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-8 py-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-slate-500">WEEK OF OCT 12, 2026</p>
          <h1 className="text-2xl font-bold">{district.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <SampleBadge />
          <div className="flex rounded-lg bg-slate-200/70 p-0.5 text-sm">
            {['7 days', '30 days', '90 days'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 ${range === r ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={() => toast('Weekly report link copied')}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <FileText className="h-4 w-4" /> Share weekly report
          </button>
        </div>
      </header>

      <div className={`${card} grid grid-cols-2 divide-slate-200 md:grid-cols-3 xl:grid-cols-5 xl:divide-x`}>
        {kpis.map((k) => (
          <div key={k.label} className="px-5 py-4">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="mt-1 text-3xl font-bold">{k.value}</p>
            <p className={`mt-1 text-xs ${k.tone}`}>{k.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <section className={card}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="font-semibold">Needs attention</h2>
            <span className="text-sm text-slate-500">{attention.length}</span>
          </div>
          {attention.map(({ issue, kind }) => (
            <div
              key={issue.id}
              onClick={() => navigate(`/org/issues/${issue.id}`)}
              className="flex cursor-pointer items-center gap-4 border-b border-slate-100 px-5 py-3.5 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="mr-2 font-mono text-xs text-slate-400">{issue.id}</span>
                  <span className="font-semibold">{issue.title}</span>
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">{attentionReason(issue)}</p>
              </div>
              <ActionButton issue={issue} kind={kind} />
            </div>
          ))}
          {!attention.length && <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing needs attention. Nice.</p>}
          <p className="px-5 py-3 text-xs text-slate-400">{attentionRule(district.rules)}</p>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
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
        <section className={`${card} p-5`}>
          <h2 className="mb-3 font-semibold">Open issues by category</h2>
          {CATEGORY_ORDER.map((c) => {
            const n = open.filter((i) => i.category === c).length;
            return (
              <div key={c} className="mb-2 flex items-center gap-3 text-sm">
                <span className="w-28">{CATEGORIES[c].label}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div className="h-3 rounded" style={{ width: `${(n / maxCategory) * 100}%`, background: CATEGORIES[c].color }} />
                </div>
                <span className="w-6 text-right font-mono text-xs">{n}</span>
              </div>
            );
          })}
        </section>
        <section className={`${card} p-5`}>
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
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold">Open issues by votes</h2>
          <button onClick={() => navigate('/org/issues')} className="flex items-center gap-1 text-sm font-semibold text-brand">
            View all {open.length} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <table className="w-full text-sm">
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
