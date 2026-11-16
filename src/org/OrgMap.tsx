import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CategoryTag, SampleBadge, StatusTag, labelClass, linkClass } from '../components/ui';
import { STATUS_ORDER } from '../data/meta';
import type { Category, Status } from '../data/types';
import { daysBetween, plural, shortDate, today } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { TodoAction } from './actions';
import { todoFor, todoHeadline } from './dashboard';
import { cityWait } from './issueList';
import { useMediaQuery } from './useMediaQuery';

const AGE_OPTIONS = [
  { label: 'Any', days: 0 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

export default function OrgMap() {
  const { issues, district } = useStore();
  const [categories, setCategories] = useState<Category[]>(district.categories);
  const [statuses, setStatuses] = useState<Status[]>(['open', 'in_review', 'scheduled', 'sent_to_city']);
  const [minAge, setMinAge] = useState(0);
  const [sizeByVotes, setSizeByVotes] = useState(true);
  const [mode, setMode] = useState<'pins' | 'heat'>('pins');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below 1024px an always-open filter panel would cover the issue card and much of the map, so
  // there it opens on demand, as on phones. Picking a pin closes it.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Phones pinch to zoom (+/- buttons would sit under the issue card). Elsewhere the buttons go
  // bottom right, since the filters take the top left.
  const wide = useMediaQuery('(min-width: 768px)');

  const visible = issues.filter(
    (i) => categories.includes(i.category) && statuses.includes(i.status) && daysBetween(i.createdAt) >= minAge,
  );
  const selected = visible.find((i) => i.id === selectedId);
  const now = today();
  const todo = selected ? todoFor(selected, district.rules, now) : null;

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const filterRow = 'flex cursor-pointer items-center gap-2 py-1';
  const count = 'ml-auto text-xs text-slate-500';

  return (
    <div className="relative h-full">
      <IssueMap
        issues={visible}
        selectedId={selectedId}
        onSelect={(i) => {
          setSelectedId(i.id);
          setFiltersOpen(false);
        }}
        sizeByVotes={sizeByVotes}
        heat={mode === 'heat'}
        zoomControl={wide}
        zoomPosition="bottomright"
      />

      <button
        onClick={() => setFiltersOpen(true)}
        className={`absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium shadow-sm lg:hidden ${
          filtersOpen ? 'hidden' : ''
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" /> Filters · {visible.length}
      </button>

      <div
        className={`absolute inset-x-3 top-3 z-[1001] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white text-sm shadow-lg md:inset-x-auto md:left-4 md:top-4 md:w-[250px] lg:block ${
          filtersOpen ? '' : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Filters</h2>
          <button
            className={`${linkClass} ml-auto mr-3 lg:mr-0`}
            onClick={() => {
              setCategories(district.categories);
              setStatuses(['open', 'in_review', 'scheduled', 'sent_to_city']);
              setMinAge(0);
            }}
          >
            Reset
          </button>
          <button onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className={`${labelClass} mb-1.5`}>Category</p>
          {district.categories.map((c) => (
            <label key={c} className={filterRow}>
              <input type="checkbox" checked={categories.includes(c)} onChange={() => toggle(categories, c, setCategories)} className="accent-ink" />
              <CategoryTag category={c} className={categories.includes(c) ? '' : 'text-slate-500'} />
              <span className={count}>{issues.filter((i) => i.category === c).length}</span>
            </label>
          ))}
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className={`${labelClass} mb-1.5`}>Status</p>
          {STATUS_ORDER.map((s) => (
            <label key={s} className={filterRow}>
              <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggle(statuses, s, setStatuses)} className="accent-ink" />
              <StatusTag status={s} className={statuses.includes(s) ? '' : 'text-slate-500'} />
              <span className={count}>{issues.filter((i) => i.status === s).length}</span>
            </label>
          ))}
        </div>
        <div className="px-4 py-3">
          <p className={`${labelClass} mb-2`}>Open longer than</p>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {AGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => setMinAge(o.days)}
                aria-pressed={minAge === o.days}
                className={`flex-1 rounded-md py-1.5 ${minAge === o.days ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between">
            Size dots by neighbors
            <input type="checkbox" checked={sizeByVotes} onChange={(e) => setSizeByVotes(e.target.checked)} className="accent-ink" />
          </label>
        </div>
      </div>

      <div className="absolute right-3 top-3 z-[1000] flex items-center gap-3 md:right-4 md:top-4">
        <SampleBadge />
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
          {(['pins', 'heat'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1 capitalize ${mode === m ? 'bg-ink font-medium text-white' : 'text-slate-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="absolute inset-x-3 bottom-3 z-[1000] rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:inset-x-auto md:bottom-auto md:right-4 md:top-20 md:w-[320px] lg:w-[360px]">
          <div className={`flex justify-between gap-3 ${labelClass}`}>
            <span>
              <span className="font-mono font-normal">{selected.id}</span> · {selected.locationLabel}
            </span>
            <button onClick={() => setSelectedId(null)} aria-label="Close" className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="mt-1 text-lg font-bold leading-snug">{selected.title}</h3>
          <p className="mt-1 flex gap-3 text-xs">
            <CategoryTag category={selected.category} />
            <StatusTag status={selected.status} />
          </p>
          {/* The same rows, in the same words, as the facts beside an issue on the Issues page. */}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Neighbors</dt>
            <dd>
              {selected.votes} (+{selected.votesThisWeek} this week)
            </dd>
            <dt className="text-slate-500">Open</dt>
            <dd>
              {plural(daysBetween(selected.createdAt), 'day')}, since {shortDate(selected.createdAt)}
            </dd>
            <dt className="text-slate-500">Owner</dt>
            <dd>{selected.owner ?? 'Unassigned'}</dd>
          </dl>
          {/* The same words as the Overview and the Issues list: why it's on the to-do list and for how long,
              or, for an issue with the City that isn't due a follow-up yet, how long since the last contact. */}
          {todo ? (
            <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs">
              <p className="font-semibold text-brand-dark">{todoHeadline(todo)}</p>
              <p className="mt-0.5 text-slate-700">{todo.reason}</p>
            </div>
          ) : (
            selected.status === 'sent_to_city' &&
            selected.cityRequest && (
              <p className="mt-3 text-xs text-slate-600">
                {selected.cityRequest.agency} · {cityWait(selected.cityRequest, now)}
              </p>
            )
          )}
          <div className="mt-3 space-y-2">
            {todo?.kind === 'city' && <TodoAction item={todo} block />}
            <button
              onClick={() => navigate(`/org/issues/${selected.id}`)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:border-slate-300"
            >
              Open issue
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[1000] hidden gap-4 rounded-lg md:flex border border-slate-200 bg-white px-4 py-2 text-xs shadow-sm">
        {STATUS_ORDER.map((s) => (
          <StatusTag key={s} status={s} />
        ))}
        {/* Below 1024px the Filters button shows the count, and the legend has to clear the zoom buttons. */}
        <span className="hidden text-slate-500 lg:inline">· {visible.length} shown</span>
      </div>
    </div>
  );
}
