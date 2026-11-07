import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, FileText, GitMerge, Search, Send } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CategoryTag, PhotoThumb, SampleBadge, StatusTag } from '../components/ui';
import { CATEGORIES, OWNERS, STATUSES, STATUS_ORDER } from '../data/meta';
import type { Issue, Status } from '../data/types';
import { daysBetween, shortDate, votesPerDay } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

const TABS: { id: string; label: string; filter: (i: Issue) => boolean }[] = [
  { id: 'inbox', label: 'Inbox', filter: (i) => i.status !== 'fixed' },
  { id: 'unassigned', label: 'Unassigned', filter: (i) => i.status !== 'fixed' && !i.owner },
  { id: 'bid', label: 'BID crew', filter: (i) => i.status !== 'fixed' && i.owner === 'BID crew' },
  { id: 'city', label: 'Sent to City', filter: (i) => i.status === 'sent_to_city' },
  { id: 'waiting', label: 'Waiting on residents', filter: (i) => i.status === 'fixed' && i.confirmedFixed < 3 },
  { id: 'fixed', label: 'Fixed · 30 days', filter: (i) => i.status === 'fixed' },
];

function VotesChart({ issue }: { issue: Issue }) {
  const days = daysBetween(issue.createdAt);
  const series = votesPerDay(issue.id, days, issue.votes);
  const max = Math.max(...series);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex justify-between font-mono text-[10px] tracking-wider text-slate-500">
        <span>VOTES PER DAY · SINCE {shortDate(issue.createdAt).toUpperCase()}</span>
        <span className="text-ink">{issue.votes} total</span>
      </div>
      <div className="flex h-20 items-end gap-1.5">
        {series.map((v, idx) => (
          <div
            key={idx}
            className="flex-1 rounded-t"
            style={{ height: `${(v / max) * 100}%`, background: idx >= series.length - 4 ? '#8e63c7' : '#d6c8ef' }}
          />
        ))}
      </div>
    </div>
  );
}

function UpdateResidents({ issue }: { issue: Issue }) {
  const { postUpdate, toast } = useStore();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(issue.status);
  useEffect(() => {
    setText('');
    setStatus(issue.status);
  }, [issue.id, issue.status]);

  return (
    <div className="rounded-xl border-2 border-brand/60 bg-white p-4">
      <div className="mb-2 flex justify-between">
        <h3 className="font-semibold">Update residents</h3>
        <span className="font-mono text-xs text-slate-500">{issue.following} following by text/email</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What changed? Residents who +1’d or follow this will see it on the issue page and in their updates."
        className="w-full rounded-lg bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="bg-transparent text-sm font-medium text-ink outline-none"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUSES[s].label}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!text.trim()}
          onClick={() => {
            postUpdate(issue.id, text.trim(), status);
            toast(`Update posted · ${issue.following} residents notified`);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
        >
          Post update
        </button>
      </div>
    </div>
  );
}

function CityCard({ issue }: { issue: Issue }) {
  const { nudgeCity, sendToCity, assign, toast } = useStore();
  const req = issue.cityRequest;

  if (req) {
    const waiting = daysBetween(req.lastFollowUp ?? req.sentOn);
    const rows: [string, string, string?][] = [
      ['Submitted', `${shortDate(req.sentOn)} by ${req.sentBy}, through the NYC 311 web form`],
      ['Routed to', req.routedTo],
      ['City status', `Received · ${req.lastFollowUp ? `followed up ${shortDate(req.lastFollowUp)}` : 'no update since'}`],
      ['Waiting', `${waiting} days · example wait, not a benchmark`, 'text-brand'],
      ['Why not our crew', `${issue.locationDetail ?? 'This asset'} belongs to ${req.agency}`],
    ];
    return (
      <div className="overflow-hidden rounded-xl border-2 border-violet-300 bg-white">
        <div className="flex items-start justify-between bg-violet-50 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] tracking-wider text-violet-700">NYC 311 SERVICE REQUEST</p>
            <p className="text-2xl font-bold">{req.sr}</p>
          </div>
          <a
            href="https://portal.311.nyc.gov/check-status/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-violet-700"
          >
            Open in NYC 311 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {rows.map(([k, v, cls]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] border-t border-slate-100 px-4 py-2.5 text-sm">
            <span className="text-slate-500">{k}</span>
            <span className={cls}>{v}</span>
          </div>
        ))}
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => {
              nudgeCity(issue.id);
              toast(`Followed up on ${req.sr} with ${issue.votes} votes attached`);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Send className="h-4 w-4" /> Nudge City with {issue.votes} votes
          </button>
          <button
            onClick={() => toast('Community board briefing drafted (demo)')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:border-slate-300"
          >
            <FileText className="h-4 w-4" /> Draft community board briefing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-mono text-[10px] tracking-wider text-slate-500">WHO FIXES THIS</p>
      {issue.agency ? (
        <>
          <p className="mt-1 font-semibold">{issue.agency} handles this, not the District.</p>
          <p className="mt-1 text-sm text-slate-600">Log a 311 request with the neighbors’ votes attached and track the City’s reply here.</p>
          <button
            onClick={() => {
              sendToCity(issue.id);
              toast(`Logged a 311 request for ${issue.id}`);
            }}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Send className="h-4 w-4" /> Forward to City with {issue.votes} votes
          </button>
        </>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-sm text-slate-600">Owner</span>
          <select
            value={issue.owner ?? ''}
            onChange={(e) => {
              assign(issue.id, e.target.value || null);
              toast(e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned');
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Unassigned</option>
            {OWNERS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default function Issues({ selectedId, tab }: { selectedId?: string; tab: string }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return store.issues
      .filter(activeTab.filter)
      .filter((i) => !q || `${i.id} ${i.title} ${i.locationLabel}`.toLowerCase().includes(q))
      .sort((a, b) => b.votes - a.votes);
  }, [store.issues, activeTab, query]);

  const issue = (selectedId && store.getIssue(selectedId)) || list[0];
  const base = tab === 'city' ? '/org/sent' : '/org/issues';
  const linkFor = (id: string) => `${base}/${id}${tab !== 'inbox' && tab !== 'city' ? `?tab=${tab}` : ''}`;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Issues</h1>
          <div className="flex items-center gap-3">
            <SampleBadge />
            <label className="flex w-64 items-center gap-2 rounded-lg border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ID, street, keyword"
                className="h-9 w-full text-sm outline-none"
              />
            </label>
          </div>
        </div>
        <nav className="mt-3 flex gap-6 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(t.id === 'city' ? '/org/sent' : `/org/issues?tab=${t.id}`)}
              className={`border-b-2 pb-2.5 ${t.id === activeTab.id ? 'border-ink font-semibold' : 'border-transparent text-slate-600'}`}
            >
              {t.label} <span className="text-slate-400">{store.issues.filter(t.filter).length}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <ul className="w-[360px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          <li className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">{list.length} issues · sorted by votes</li>
          {list.map((i) => (
            <li
              key={i.id}
              onClick={() => navigate(linkFor(i.id))}
              className={`cursor-pointer border-b border-slate-100 px-5 py-3 ${
                issue?.id === i.id ? 'border-l-4 border-l-brand bg-brand-soft' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between font-mono text-[11px] text-slate-400">
                <span>{i.id}</span>
                <span>{daysBetween(i.createdAt)}d</span>
              </div>
              <p className="font-medium">{i.title}</p>
              <p className="mt-1 flex gap-3 text-xs text-slate-600">
                <CategoryTag category={i.category} />
                <StatusTag status={i.status} />
                <span className="font-semibold">^ {i.votes}</span>
              </p>
            </li>
          ))}
          {!list.length && <li className="p-8 text-center text-sm text-slate-500">No issues here.</li>}
        </ul>

        {issue ? (
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] tracking-wider text-slate-500">
                  {issue.id} · {CATEGORIES[issue.category].label.toUpperCase()} · {issue.locationLabel.toUpperCase()}
                </p>
                <h2 className="mt-1 text-2xl font-bold">{issue.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <StatusTag status={issue.status} className="text-ink" /> · Opened {shortDate(issue.createdAt)} ·{' '}
                  {daysBetween(issue.createdAt)} days
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => store.toast('Merging duplicates is out of scope for this prototype')}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium"
                >
                  <GitMerge className="h-4 w-4" /> Merge
                </button>
                {issue.status !== 'fixed' && (
                  <button
                    onClick={() => {
                      store.setStatus(issue.id, 'fixed');
                      store.toast(`${issue.id} marked fixed · residents asked to confirm`);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium"
                  >
                    <Check className="h-4 w-4" /> Mark fixed
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_260px] gap-5">
              <div className="space-y-4">
                {issue.description && <p className="text-[15px] leading-relaxed text-slate-700">{issue.description}</p>}
                <CityCard issue={issue} />
                <div className="grid grid-cols-3 gap-2">
                  <PhotoThumb issue={issue} className="h-24 rounded-lg" />
                  <PhotoThumb issue={issue} index={1} className="h-24 rounded-lg opacity-80" />
                  <div className="grid h-24 place-items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500">
                    {issue.photos.length > 2 ? `+${issue.photos.length - 2} photos` : 'No more photos'}
                  </div>
                </div>
                <VotesChart issue={issue} />
                <UpdateResidents issue={issue} />
                {issue.updates.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="mb-2 font-mono text-[10px] tracking-wider text-slate-500">POSTED ON THE PUBLIC PAGE</h3>
                    {issue.updates.map((u) => (
                      <div key={u.id} className="border-t border-slate-100 py-2 text-sm first:border-t-0">
                        <span className="font-semibold">{u.author}</span>{' '}
                        <span className="font-mono text-[11px] text-slate-400">{shortDate(u.date)}</span>
                        <p className="text-slate-700">{u.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="h-36 overflow-hidden rounded-xl border border-slate-200">
                  <IssueMap
                    issues={store.issues.filter((i) => i.status !== 'fixed' || i.id === issue.id)}
                    selectedId={issue.id}
                    center={{ lat: issue.lat, lng: issue.lng }}
                    zoom={15}
                    onSelect={(i) => navigate(linkFor(i.id))}
                  />
                </div>
                <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
                  {[
                    ['Owner', issue.owner ?? 'Unassigned'],
                    ['Votes', `${issue.votes} (+${issue.votesThisWeek} this week)`],
                    ['Following', issue.following],
                    ['Duplicates merged', issue.duplicatesMerged],
                    ['Confirmed fixed', issue.confirmedFixed],
                    ['Came in through', issue.via],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 px-3 py-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <h3 className="mb-2 font-mono text-[10px] tracking-wider text-slate-500">ACTIVITY</h3>
                  <ol className="space-y-1.5 text-sm">
                    {[...issue.history].reverse().map((h, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="w-12 shrink-0 font-mono text-[11px] text-slate-400">{shortDate(h.date)}</span>
                        <span>{h.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <button onClick={() => navigate(`/i/${issue.id}`)} className="text-sm font-semibold text-brand">
                  View resident page →
                </button>
              </aside>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center text-slate-500">Select an issue</div>
        )}
      </div>
    </div>
  );
}
