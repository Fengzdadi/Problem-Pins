import { Download, Link } from 'lucide-react';
import { SampleBadge } from '../components/ui';
import { CATEGORIES } from '../data/meta';
import type { Category } from '../data/types';
import { daysBetween, shortDate } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

// Historical September figures; the waiting-on-City table below is live.
const MEDIAN_DAYS: [Category, number, string?][] = [
  ['litter', 2.5],
  ['seating', 9.0],
  ['accessibility', 12.0],
  ['lighting', 14.5],
  ['noise', 21.0, 'Noise (City)'],
];

export default function Reports() {
  const { issues, toast, district } = useStore();
  const waiting = issues
    .filter((i) => i.status === 'sent_to_city' || (i.agency && !i.cityRequest && i.status !== 'fixed'))
    .sort((a, b) => daysBetween(b.cityRequest?.sentOn ?? b.createdAt) - daysBetween(a.cityRequest?.sentOn ?? a.createdAt));
  const quotes = issues.flatMap((i) => i.updates.filter((u) => u.role === 'resident' && !u.mine).map((u) => ({ u, i }))).slice(0, 2);

  const kpis = [
    ['Problems pinned', '71', '+22 vs Aug'],
    ['Fixed', '30', '25 confirmed by residents'],
    ['Median days to fix', '11.0', 'target: 10'],
    ['Residents who took part', '412', 'pinned, voted or confirmed'],
  ];
  const maxDays = 24;

  return (
    <div className="mx-auto max-w-[1060px] px-8 py-7">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-slate-500">REPORTS / MONTHLY</p>
          <h1 className="text-2xl font-bold">September 2026 report</h1>
          <p className="text-sm text-slate-600">For the {district.name} board meeting on Oct 21</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <SampleBadge />
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
        <p className="font-mono text-[10px] tracking-wider text-slate-500">SUMMARY</p>
        <p className="mt-2 text-lg leading-relaxed">
          Residents pinned 71 problems in the district in September, 22 more than in August. The crew closed 30 and residents
          confirmed 25 of those fixes. Lighting passed litter as the top complaint, mostly because of the W 16th St streetlights,
          which belong to NYC DOT and are still waiting on a fix.
        </p>

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
            <p className="mb-3 font-mono text-[10px] tracking-wider text-slate-500">MEDIAN DAYS TO FIX, BY CATEGORY</p>
            <div className="relative">
              {MEDIAN_DAYS.map(([c, d, label]) => (
                <div key={c} className="mb-3 flex items-center gap-3 text-sm">
                  <span className="w-28">{label ?? CATEGORIES[c].label}</span>
                  <div className="relative h-5 flex-1">
                    <div className="h-5 rounded" style={{ width: `${(d / maxDays) * 100}%`, background: CATEGORIES[c].color }} />
                    <div
                      className="absolute -bottom-1.5 -top-1.5 border-l border-dashed border-slate-500"
                      style={{ left: `${(10 / maxDays) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 font-mono text-xs">{d.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <p className="ml-[7.75rem] font-mono text-[10px] text-slate-500">dashed line = 10-day target</p>
          </div>
          <div>
            <p className="mb-3 font-mono text-[10px] tracking-wider text-slate-500">IN RESIDENTS’ WORDS</p>
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
          <div className="mb-2 flex justify-between font-mono text-[10px] tracking-wider text-slate-500">
            <span>WAITING ON THE CITY · LIVE</span>
            <span className="font-sans tracking-normal">For the next community board discussion</span>
          </div>
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
                  <tr key={i.id} onClick={() => navigate(`/org/issues/${i.id}`)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 font-mono text-xs text-slate-500">{i.id}</td>
                    <td className="py-2.5">
                      {i.title}
                      {i.cityRequest ? ` · SR ${i.cityRequest.sr}` : ' · not yet sent'}
                    </td>
                    <td className="py-2.5">{i.agency}</td>
                    <td className="py-2.5">{i.votes}</td>
                    <td className={`py-2.5 font-mono text-xs ${days > 10 ? 'text-brand' : ''}`}>{days} days</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
