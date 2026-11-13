import { useState } from 'react';
import { X } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CategoryTag, SampleBadge, StatusTag } from '../components/ui';
import { CATEGORIES, CATEGORY_ORDER, STATUSES, STATUS_ORDER } from '../data/meta';
import type { Category, Status } from '../data/types';
import { daysBetween, shortDate } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { ActionButton, attentionFor } from './actions';

const AGE_OPTIONS = [
  { label: 'Any', days: 0 },
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
];

export default function OrgMap() {
  const { issues, district } = useStore();
  const [categories, setCategories] = useState<Category[]>(CATEGORY_ORDER);
  const [statuses, setStatuses] = useState<Status[]>(['open', 'in_review', 'scheduled', 'sent_to_city']);
  const [minAge, setMinAge] = useState(0);
  const [sizeByVotes, setSizeByVotes] = useState(true);
  const [mode, setMode] = useState<'pins' | 'heat'>('pins');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = issues.filter(
    (i) => categories.includes(i.category) && statuses.includes(i.status) && daysBetween(i.createdAt) >= minAge,
  );
  const selected = visible.find((i) => i.id === selectedId);
  const action = selected ? attentionFor(selected, district.rules) : null;

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const checkbox = (checked: boolean) =>
    `grid h-4 w-4 place-items-center rounded border text-[10px] text-white ${checked ? 'border-brand bg-brand' : 'border-slate-300 bg-white'}`;

  return (
    <div className="relative h-full">
      <IssueMap
        issues={visible}
        selectedId={selectedId}
        onSelect={(i) => setSelectedId(i.id)}
        sizeByVotes={sizeByVotes}
        heat={mode === 'heat'}
        zoomControl
      />

      <div className="absolute left-4 top-4 z-[1000] w-[250px] rounded-xl border border-slate-200 bg-white text-sm shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">Filters</h2>
          <button
            className="text-brand"
            onClick={() => {
              setCategories(CATEGORY_ORDER);
              setStatuses(['open', 'in_review', 'scheduled', 'sent_to_city']);
              setMinAge(0);
            }}
          >
            Reset
          </button>
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="mb-2 font-mono text-[10px] tracking-wider text-slate-500">CATEGORY</p>
          {CATEGORY_ORDER.map((c) => (
            <button key={c} onClick={() => toggle(categories, c, setCategories)} className="flex w-full items-center gap-2 py-1">
              <span className={checkbox(categories.includes(c))}>{categories.includes(c) && '✓'}</span>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[c].color }} />
              <span className={`flex-1 text-left ${categories.includes(c) ? '' : 'text-slate-400'}`}>{CATEGORIES[c].label}</span>
              <span className="text-xs text-slate-400">{issues.filter((i) => i.category === c).length}</span>
            </button>
          ))}
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="mb-2 font-mono text-[10px] tracking-wider text-slate-500">STATUS</p>
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => toggle(statuses, s, setStatuses)} className="flex w-full items-center gap-2 py-1">
              <span className={checkbox(statuses.includes(s))}>{statuses.includes(s) && '✓'}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: STATUSES[s].color }} />
              <span className={`flex-1 text-left ${statuses.includes(s) ? '' : 'text-slate-400'}`}>{STATUSES[s].label}</span>
              <span className="text-xs text-slate-400">{issues.filter((i) => i.status === s).length}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          <p className="mb-2 font-mono text-[10px] tracking-wider text-slate-500">OPEN LONGER THAN</p>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {AGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => setMinAge(o.days)}
                className={`flex-1 rounded-md py-1 ${minAge === o.days ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between">
            Size dots by votes
            <input type="checkbox" checked={sizeByVotes} onChange={(e) => setSizeByVotes(e.target.checked)} className="accent-brand" />
          </label>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-[1000] flex items-center gap-3">
        <SampleBadge />
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
          {(['pins', 'heat'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 capitalize ${mode === m ? 'bg-ink font-medium text-white' : 'text-slate-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="absolute right-4 top-20 z-[1000] w-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex justify-between font-mono text-[10px] tracking-wider text-slate-500">
            <span>
              {selected.id} · {selected.locationLabel.toUpperCase()}
            </span>
            <button onClick={() => setSelectedId(null)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="mt-1 text-lg font-bold leading-snug">{selected.title}</h3>
          <p className="mt-1 flex gap-3 text-xs">
            <CategoryTag category={selected.category} />
            <StatusTag status={selected.status} />
          </p>
          <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-2 text-sm">
            <div className="px-3">
              <p className="font-mono text-[9px] text-slate-500">VOTES</p>
              <p className="font-semibold">{selected.votes}</p>
              <p className="text-[11px] text-emerald-700">+{selected.votesThisWeek} this week</p>
            </div>
            <div className="px-3">
              <p className="font-mono text-[9px] text-slate-500">OPEN</p>
              <p className="font-semibold">{daysBetween(selected.createdAt)} days</p>
              <p className="text-[11px] text-slate-500">since {shortDate(selected.createdAt)}</p>
            </div>
            <div className="px-3">
              <p className="font-mono text-[9px] text-slate-500">OWNER</p>
              <p className="truncate font-semibold">{selected.owner ?? '—'}</p>
              {selected.cityRequest && (
                <p className="text-[11px] text-brand">
                  no reply {daysBetween(selected.cityRequest.lastFollowUp ?? selected.cityRequest.sentOn)}d
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {action && (
              <div className="flex-1 [&>button]:w-full [&>button]:justify-center">
                <ActionButton issue={selected} kind={action} />
              </div>
            )}
            <button
              onClick={() => navigate(`/org/issues/${selected.id}`)}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:border-slate-300"
            >
              Open issue
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-[1000] flex gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs shadow-sm">
        {STATUS_ORDER.map((s) => (
          <StatusTag key={s} status={s} />
        ))}
        <span className="text-slate-500">· {visible.length} shown</span>
      </div>
    </div>
  );
}
