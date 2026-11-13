import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, GitMerge, Search, Send } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CategoryTag, PhotoThumb, SampleBadge, StatusTag } from '../components/ui';
import { CATEGORIES, STATUSES, STATUS_ORDER } from '../data/meta';
import type { District, Issue, Status } from '../data/types';
import { addDays, daysBetween, shortDate, today } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { ForwardToCityForm } from './ForwardToCity';
import { HideDialog, MergeDialog } from './Moderation';
import { useMediaQuery } from './useMediaQuery';

interface Tab {
  id: string;
  label: string;
  /** `hidden` lists hidden and merged issues instead of the public ones. */
  source: 'public' | 'hidden';
  filter: (i: Issue) => boolean;
}

function tabsFor(district: District): Tab[] {
  const since = addDays(today(), -29);
  return [
    { id: 'inbox', label: 'Inbox', source: 'public', filter: (i) => i.status !== 'fixed' },
    { id: 'unassigned', label: 'Unassigned', source: 'public', filter: (i) => i.status !== 'fixed' && !i.owner },
    ...district.teams.map(
      (team, idx): Tab => ({ id: `team${idx + 1}`, label: team, source: 'public', filter: (i) => i.status !== 'fixed' && i.owner === team }),
    ),
    { id: 'city', label: 'Sent to City', source: 'public', filter: (i) => i.status === 'sent_to_city' },
    { id: 'waiting', label: 'Fixed, not confirmed', source: 'public', filter: (i) => i.status === 'fixed' && i.confirmedFixed === 0 },
    { id: 'fixed', label: 'Fixed · 30 days', source: 'public', filter: (i) => i.status === 'fixed' && Boolean(i.fixedOn && i.fixedOn >= since) },
    { id: 'hidden', label: 'Hidden & merged', source: 'hidden', filter: () => true },
  ];
}

/** Honest vote summary: the contract only knows the total and the last 7 days. */
function VotesSummary({ issue }: { issue: Issue }) {
  const before = Math.max(0, issue.votes - issue.votesThisWeek);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex justify-between font-mono text-[10px] tracking-wider text-slate-500">
        <span>VOTES · SINCE {shortDate(issue.createdAt).toUpperCase()}</span>
        <span className="text-ink">{issue.votes} total</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded bg-slate-100">
        <div style={{ flex: before, background: '#d6c8ef' }} />
        <div style={{ flex: issue.votesThisWeek, background: '#8e63c7' }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-600">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: '#8e63c7' }} />
          {issue.votesThisWeek} in the last 7 days
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: '#d6c8ef' }} />
          {before} before that
        </span>
      </p>
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
      <div className="mb-2 flex flex-wrap justify-between gap-x-3">
        <h3 className="font-semibold">Update residents</h3>
        <span className="font-mono text-xs text-slate-500">{issue.following} following</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What changed? Residents who +1’d or follow this will see it on the issue page and in their updates."
        className="w-full rounded-lg bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
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
          onClick={async () => {
            if (await postUpdate(issue.id, text.trim(), status)) toast(`Update posted on ${issue.id}`);
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
  const { nudgeCity, assign, toast, district } = useStore();
  const [forwarding, setForwarding] = useState(false);
  useEffect(() => setForwarding(false), [issue.id]);
  const req = issue.cityRequest;

  if (req) {
    const since = req.lastFollowUp ?? req.sentOn;
    const rows: [string, string, string?][] = [
      ['Filed', `${shortDate(req.sentOn)} by ${req.sentBy}`],
      ['Agency', req.agency],
      ...(req.routedTo && req.routedTo !== req.agency ? [['Routed to', req.routedTo] as [string, string]] : []),
      ['Last follow-up', req.lastFollowUp ? shortDate(req.lastFollowUp) : 'None yet'],
      ['Waiting', `${daysBetween(since)} days since ${req.lastFollowUp ? 'the last follow-up' : 'filing'}`, 'text-brand'],
    ];
    return (
      <div className="overflow-hidden rounded-xl border-2 border-violet-300 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-2 bg-violet-50 px-4 py-3">
          <div>
            <p className="font-mono text-[10px] tracking-wider text-violet-700">NYC 311 SERVICE REQUEST</p>
            <p className="font-mono text-xl font-bold sm:text-2xl">{req.sr}</p>
          </div>
          <a
            href="https://portal.311.nyc.gov/check-status/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-violet-700"
          >
            Check status on NYC 311 <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {rows.map(([k, v, cls]) => (
          <div key={k} className="grid grid-cols-[110px_1fr] gap-2 border-t border-slate-100 px-4 py-2.5 text-sm sm:grid-cols-[150px_1fr]">
            <span className="text-slate-500">{k}</span>
            <span className={cls}>{v}</span>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={async () => {
              if (await nudgeCity(issue.id)) toast(`Follow-up on ${req.sr} recorded`);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Send className="h-4 w-4" /> Record a follow-up
          </button>
          <p className="basis-full text-xs text-slate-500">
            Follow up with 311 or {req.agency} first (mention the {issue.votes} neighbors), then record it here so the wait resets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-mono text-[10px] tracking-wider text-slate-500">WHO FIXES THIS</p>
      {issue.agency && !forwarding && (
        <>
          <p className="mt-1 font-semibold">{issue.agency} handles this, not the District.</p>
          <p className="mt-1 text-sm text-slate-600">File it with 311, then record the SR number here to track the City’s reply.</p>
          <button
            onClick={() => setForwarding(true)}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Send className="h-4 w-4" /> Forward to City
          </button>
        </>
      )}
      {!issue.agency && !forwarding && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-600">Owner</span>
            <select
              value={issue.owner ?? ''}
              onChange={async (e) => {
                const owner = e.target.value || null;
                if (await assign(issue.id, owner)) toast(owner ? `Assigned to ${owner}` : 'Unassigned');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {district.teams.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setForwarding(true)} className="mt-3 text-sm font-medium text-slate-600 hover:text-ink">
            The City handles this? Forward to 311 →
          </button>
        </>
      )}
      {forwarding && (
        <div className="mt-2">
          <ForwardToCityForm issue={issue} onDone={() => setForwarding(false)} onCancel={() => setForwarding(false)} />
        </div>
      )}
    </div>
  );
}

function ModerationBanner({ issue }: { issue: Issue }) {
  const { unhideIssue, toast } = useStore();
  if (issue.mergedInto) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white">
        <GitMerge className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Merged into <span className="font-mono">{issue.mergedInto}</span>. Residents opening this link are sent there.
        </span>
        <button onClick={() => navigate(`/org/issues/${issue.mergedInto}`)} className="font-semibold text-orange-300 hover:text-orange-200">
          Open {issue.mergedInto} →
        </button>
      </div>
    );
  }
  if (issue.hidden) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white">
        <EyeOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">Hidden from the public{issue.hiddenReason ? `: ${issue.hiddenReason}` : ''}.</span>
        <button
          onClick={async () => {
            if (await unhideIssue(issue.id)) toast(`${issue.id} is back on the public map`);
          }}
          className="flex items-center gap-1.5 font-semibold text-orange-300 hover:text-orange-200"
        >
          <Eye className="h-4 w-4" /> Unhide
        </button>
      </div>
    );
  }
  return null;
}

export default function Issues({ selectedId, tab }: { selectedId?: string; tab: string }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'merge' | 'hide' | null>(null);
  useEffect(() => setDialog(null), [selectedId]);

  const tabs = useMemo(() => tabsFor(store.district), [store.district]);
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0];
  const sourceFor = (t: Tab) => (t.source === 'hidden' ? store.hiddenIssues : store.issues);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (activeTab.source === 'hidden' ? store.hiddenIssues : store.issues)
      .filter(activeTab.filter)
      .filter((i) => !q || `${i.id} ${i.title} ${i.locationLabel}`.toLowerCase().includes(q))
      .sort((a, b) => b.votes - a.votes);
  }, [store.issues, store.hiddenIssues, activeTab, query]);

  const missing = Boolean(selectedId && !store.getIssue(selectedId));
  const issue = selectedId ? store.getIssue(selectedId) : list[0];
  const base = activeTab.id === 'city' ? '/org/sent' : '/org/issues';
  const tabQuery = activeTab.id !== 'inbox' && activeTab.id !== 'city' ? `?tab=${activeTab.id}` : '';
  const linkFor = (id: string) => `${base}/${id}${tabQuery}`;
  // Phones show the list or one issue, never both. `selectedId` decides which.
  const showDetailOnPhone = Boolean(selectedId);
  // Don't mount the detail (and its map) while it's hidden: Leaflet can't size a map in a hidden box.
  const wide = useMediaQuery('(min-width: 768px)');
  const showDetail = wide || showDetailOnPhone;

  return (
    <div className="flex h-full flex-col">
      <header className={`border-b border-slate-200 bg-white px-4 pt-4 md:px-6 md:pt-5 ${showDetailOnPhone ? 'hidden md:block' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="sr-only md:not-sr-only md:text-2xl md:font-bold">Issues</h1>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <SampleBadge />
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 focus-within:border-brand sm:w-64 sm:flex-none">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ID, street, keyword"
                className="h-9 w-full min-w-0 text-sm outline-none"
              />
            </label>
          </div>
        </div>
        <nav className="no-scrollbar -mx-4 mt-3 flex gap-5 overflow-x-auto px-4 text-sm md:mx-0 md:gap-6 md:px-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(t.id === 'city' ? '/org/sent' : `/org/issues?tab=${t.id}`)}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 ${t.id === activeTab.id ? 'border-ink font-semibold' : 'border-transparent text-slate-600'}`}
            >
              {t.label} <span className="text-slate-400">{sourceFor(t).filter(t.filter).length}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <ul
          className={`w-full shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:block md:w-[320px] lg:w-[360px] ${
            showDetailOnPhone ? 'hidden' : ''
          }`}
        >
          <li className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 md:px-5">
            {list.length} {list.length === 1 ? 'issue' : 'issues'} · sorted by votes
          </li>
          {list.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => navigate(linkFor(i.id))}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left md:px-5 ${
                  issue?.id === i.id ? 'md:border-l-4 md:border-l-brand md:bg-brand-soft' : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex justify-between font-mono text-[11px] text-slate-400">
                  <span>{i.id}</span>
                  <span>{i.mergedInto ? `→ ${i.mergedInto}` : i.hidden ? 'hidden' : `${daysBetween(i.createdAt)}d`}</span>
                </span>
                <span className="block font-medium">{i.title}</span>
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  <CategoryTag category={i.category} />
                  <StatusTag status={i.status} />
                  <span className="font-semibold">^ {i.votes}</span>
                </span>
                {i.hidden && i.hiddenReason && <span className="mt-1 block truncate text-xs text-slate-500">{i.hiddenReason}</span>}
              </button>
            </li>
          ))}
          {!list.length && (
            <li className="p-8 text-center text-sm text-slate-500">
              {activeTab.source === 'hidden' ? 'Nothing hidden or merged.' : 'No issues here.'}
            </li>
          )}
        </ul>

        {!showDetail ? null : issue ? (
          <div className={`min-w-0 flex-1 overflow-y-auto px-4 py-4 md:block md:px-6 md:py-5 ${showDetailOnPhone ? '' : 'hidden'}`}>
            <button
              onClick={() => navigate(`${base}${tabQuery}`)}
              className="-ml-1 mb-3 flex items-center gap-1 text-sm font-medium text-slate-600 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> {activeTab.label}
            </button>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] tracking-wider text-slate-500">
                  {issue.id} · {CATEGORIES[issue.category].label.toUpperCase()} · {issue.locationLabel.toUpperCase()}
                </p>
                <h2 className="mt-1 text-xl font-bold md:text-2xl">{issue.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <StatusTag status={issue.status} className="text-ink" /> · Opened {shortDate(issue.createdAt)} ·{' '}
                  {daysBetween(issue.createdAt)} days
                </p>
              </div>
              {!issue.mergedInto && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    onClick={() => setDialog('merge')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-300"
                  >
                    <GitMerge className="h-4 w-4" /> Merge
                  </button>
                  {!issue.hidden && (
                    <button
                      onClick={() => setDialog('hide')}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-300"
                    >
                      <EyeOff className="h-4 w-4" /> Hide
                    </button>
                  )}
                  {issue.status !== 'fixed' && (
                    <button
                      onClick={async () => {
                        if (await store.setStatus(issue.id, 'fixed')) store.toast(`${issue.id} marked fixed · residents asked to confirm`);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-300"
                    >
                      <Check className="h-4 w-4" /> Mark fixed
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-5 md:mt-5 xl:grid-cols-[1fr_260px]">
              <div className="min-w-0 space-y-4">
                <ModerationBanner issue={issue} />
                {issue.description && <p className="text-[15px] leading-relaxed text-slate-700">{issue.description}</p>}
                {!issue.mergedInto && <CityCard issue={issue} />}
                {issue.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {issue.photos.slice(0, issue.photos.length > 3 ? 2 : 3).map((_, idx) => (
                      <a key={idx} href={issue.photos[idx]} target="_blank" rel="noreferrer">
                        <PhotoThumb issue={issue} index={idx} className="h-20 w-full rounded-lg sm:h-24" />
                      </a>
                    ))}
                    {issue.photos.length > 3 && (
                      <div className="grid h-20 place-items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500 sm:h-24">
                        +{issue.photos.length - 2} photos
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">No photos with this report.</p>
                )}
                <VotesSummary issue={issue} />
                {!issue.mergedInto && <UpdateResidents issue={issue} />}
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

              <aside className="min-w-0 space-y-4">
                <div className="h-40 overflow-hidden rounded-xl border border-slate-200 xl:h-36">
                  <IssueMap
                    issues={[...store.issues.filter((i) => i.status !== 'fixed' && i.id !== issue.id), issue]}
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
            {dialog === 'merge' && <MergeDialog issue={issue} onClose={() => setDialog(null)} />}
            {dialog === 'hide' && <HideDialog issue={issue} onClose={() => setDialog(null)} />}
          </div>
        ) : (
          <div className={`flex-1 place-items-center p-6 text-center text-slate-500 md:grid ${missing ? 'grid' : 'hidden'}`}>
            {missing ? (
              <div>
                <p>
                  There’s no issue <span className="font-mono">{selectedId}</span>.
                </p>
                <button onClick={() => navigate(`${base}${tabQuery}`)} className="mt-2 font-semibold text-brand">
                  Back to {activeTab.label}
                </button>
              </div>
            ) : (
              'Select an issue'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
