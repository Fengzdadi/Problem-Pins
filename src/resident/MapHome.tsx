import { useMemo, useState } from 'react';
import { Bell, ChevronUp, Plus, Search, X } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { PhotoThumb, StatusTag } from '../components/ui';
import { CATEGORIES, CATEGORY_ORDER } from '../data/meta';
import { YOU_ARE_HERE, distanceMeters } from '../data/geo';
import type { Category, Issue } from '../data/types';
import { daysBetween, formatMeters } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

export function VoteBox({ issue }: { issue: Issue }) {
  const { voted, vote } = useStore();
  const done = voted.includes(issue.id);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        vote(issue.id);
      }}
      aria-label={done ? 'You +1’d this' : '+1 this problem'}
      className={`flex w-11 shrink-0 flex-col items-center rounded-lg border py-1.5 text-sm font-semibold transition ${
        done ? 'border-brand bg-brand-soft text-brand' : 'border-slate-200 text-ink hover:border-brand hover:text-brand'
      }`}
    >
      <ChevronUp className="h-4 w-4" strokeWidth={2.5} />
      {issue.votes}
    </button>
  );
}

export default function MapHome() {
  const { issues, voted, confirmed, lastCreatedId, clearLastCreated } = useStore();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const active = issues.filter((i) => i.status !== 'fixed');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (!q || `${i.title} ${i.locationLabel} ${i.id}`.toLowerCase().includes(q)),
    );
  }, [active, category, query]);

  const ranked = [...visible].sort((a, b) => b.votes - a.votes);
  const created = lastCreatedId ? issues.find((i) => i.id === lastCreatedId) : undefined;
  const hasPendingConfirm = issues.some((i) => i.status === 'fixed' && voted.includes(i.id) && !confirmed[i.id]);

  const chip = (selected: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm ${
      selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-ink'
    }`;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <IssueMap
          issues={visible}
          selectedId={created?.id}
          center={created ? { lat: created.lat, lng: created.lng } : undefined}
          voteLabelsAbove={60}
          showYou
          onSelect={(i) => navigate(`/i/${i.id}`)}
        />
      </div>

      <div className="absolute inset-x-0 top-0 z-[1000] space-y-2.5 p-4">
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search West Chelsea"
              className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </label>
          <button
            onClick={() => navigate('/updates')}
            className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm"
            aria-label="Your updates"
          >
            <Bell className="h-5 w-5" />
            {hasPendingConfirm && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand" />}
          </button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          <button className={chip(category === 'all')} onClick={() => setCategory('all')}>
            All <span className="opacity-70">{active.length}</span>
          </button>
          {CATEGORY_ORDER.map((c) => {
            const count = active.filter((i) => i.category === c).length;
            return (
              <button key={c} className={chip(category === c)} onClick={() => setCategory(category === c ? 'all' : c)}>
                {category !== c && <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[c].color }} />}
                {CATEGORIES[c].label} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-[height] ${
          expanded ? 'h-[72%]' : 'h-[40%]'
        }`}
      >
        <button
          onClick={() => navigate('/new')}
          className="absolute -top-16 right-4 flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-lg hover:bg-brand-dark"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} /> Pin a problem
        </button>

        <button onClick={() => setExpanded(!expanded)} className="flex justify-center pb-1 pt-2" aria-label="Expand list">
          <span className="h-1 w-9 rounded-full bg-slate-300" />
        </button>

        {created && (
          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <button className="text-left" onClick={() => navigate(`/i/${created.id}`)}>
              <span className="font-semibold">Your pin is live.</span> Neighbors can +1 it now.
            </button>
            <button onClick={clearLastCreated} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-lg font-semibold">Most +1’d nearby</h2>
          <span className="text-sm text-slate-500">{ranked.length} open</span>
        </div>

        <ul className="flex-1 overflow-y-auto px-5 pb-4">
          {ranked.map((issue) => (
            <li
              key={issue.id}
              onClick={() => navigate(`/i/${issue.id}`)}
              className="flex cursor-pointer items-center gap-3 border-t border-slate-100 py-3"
            >
              <VoteBox issue={issue} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{issue.title}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  <StatusTag status={issue.status} resident className="text-slate-600" /> ·{' '}
                  {formatMeters(distanceMeters(YOU_ARE_HERE, issue))} · {daysBetween(issue.createdAt)} days
                </p>
              </div>
              <PhotoThumb issue={issue} className="h-12 w-12 shrink-0 rounded-lg" />
            </li>
          ))}
          {!ranked.length && <li className="py-8 text-center text-sm text-slate-500">No open problems match.</li>}
        </ul>
      </div>
    </div>
  );
}
