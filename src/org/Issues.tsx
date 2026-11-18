import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, GitMerge, Search, Send } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { CategoryTag, PhotoThumb, SampleBadge, StatusTag, fieldBoxClass, labelClass, linkClass } from '../components/ui';
import { CATEGORIES, STATUSES, STATUS_ORDER } from '../data/meta';
import type { Issue, Status } from '../data/types';
import { daysBetween, plural, shortDate, today } from '../lib/format';
import { useProgressive } from '../lib/useProgressive';
import { navigate } from '../router';
import { useStore } from '../store';
import { CHECK_311, copySr } from './actions';
import { todoFor, todoHeadline, type TodoItem } from './dashboard';
import { ForwardToCityForm } from './ForwardToCity';
import { TABS, cityWait, issueList, tabCount, type TabId } from './issueList';
import { HideDialog, MergeDialog } from './Moderation';
import { useMediaQuery } from './useMediaQuery';

/** Asks the residents box to scroll into view and take focus, with a status picked if given. `n` makes every ask a new one. */
interface Compose {
  status?: Status;
  n: number;
}

const button = 'flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-300';

/** Why the issue is on the to-do list, in the Overview's words, and the action that takes it off. */
function TodoLine({ todo, onCompose, onHide }: { todo: TodoItem; onCompose: (status?: Status) => void; onHide: () => void }) {
  const { dismissReports, toast } = useStore();
  const label = todo.kind === 'quiet' ? 'Post update' : todo.kind === 'residents' ? 'Reply' : 'Respond';
  const [title, wait] = todoHeadline(todo).split(' · ');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-brand-soft px-4 py-3">
      <div className="min-w-0 flex-1 basis-56 text-sm">
        <p className="font-semibold text-brand-dark">
          {title} · <span className="whitespace-nowrap">{wait}</span>
        </p>
        {/* For an issue nobody has answered the reason is when it was pinned and by how many, which the page already says. */}
        {todo.kind !== 'new' && <p className="mt-0.5 text-slate-700">{todo.reason}</p>}
      </div>
      {/* Reports are answered by hiding the pin or keeping it. Residents never see either. */}
      {todo.kind === 'reported' && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={onHide} className={button}>
            <EyeOff className="h-4 w-4" /> Hide…
          </button>
          <button
            onClick={async () => {
              if (await dismissReports(todo.issue.id)) toast(`Reports on ${todo.issue.id} dismissed`);
            }}
            className={button}
          >
            Keep pin, dismiss reports
          </button>
        </div>
      )}
      {/* A City follow-up is logged on the 311 card below. */}
      {todo.kind !== 'city' && todo.kind !== 'reported' && (
        <div className="flex shrink-0 gap-2">
          {todo.issue.status === 'fixed' && (
            <button onClick={() => onCompose('in_review')} className={button}>
              Reopen…
            </button>
          )}
          {/* Replying keeps the status unless the staffer picks another. */}
          <button onClick={() => onCompose(todo.issue.status)} className={button}>
            {label}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Everything on the public page as one thread, oldest first, with the box for the next update
 * at the end, so a reply is written under what it answers. Changing the status goes through
 * here too, so residents always get a line with it.
 */
function ResidentsThread({ issue, compose, canPost }: { issue: Issue; compose: Compose | null; canPost: boolean }) {
  const { postUpdate, toast } = useStore();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(issue.status);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText('');
    setStatus(issue.status);
  }, [issue.id, issue.status]);
  useEffect(() => {
    if (!compose) return;
    if (compose.status) setStatus(compose.status);
    box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.current?.focus({ preventScroll: true });
  }, [compose]);

  const posts = [...issue.updates].sort((a, b) => a.date.localeCompare(b.date));
  // "Sent to City" needs an SR number, so it comes from the 311 form, not from here.
  const statuses = STATUS_ORDER.filter((s) => s !== 'sent_to_city' || issue.cityRequest || issue.status === 'sent_to_city');
  const fixing = status === 'fixed' && issue.status !== 'fixed';
  const label =
    status === issue.status
      ? 'Post update'
      : fixing
        ? 'Post and mark fixed'
        : issue.status === 'fixed'
          ? 'Post and reopen'
          : `Post and set to ${STATUSES[status].label}`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h3 className="px-4 pt-3 font-semibold">Residents</h3>
      {posts.length > 0 ? (
        <ol className="mt-2 space-y-2 px-4">
          {posts.map((u) => {
            const resident = u.role === 'resident';
            return (
              <li key={u.id} className={`text-sm ${resident ? 'rounded-lg bg-slate-50 px-3 py-2' : 'border-l-2 border-slate-300 py-0.5 pl-3'}`}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{u.author}</span>
                  {resident && <span className="text-xs text-slate-500">resident</span>}
                  {/* Who at the office posted it. Residents see only the district. */}
                  {u.staffName && <span className="text-xs text-slate-500">{u.staffName}</span>}
                  <span className="text-xs text-slate-500">{shortDate(u.date)}</span>
                </p>
                <p className="text-slate-700">{u.text}</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-1 px-4 text-sm text-slate-500">Nothing posted yet.</p>
      )}
      {canPost ? (
        <div className="mt-3 border-t border-slate-100 p-4">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="Update for residents"
            placeholder={
              fixing
                ? 'What was done, and by whom? Neighbors will be asked to confirm it’s fixed.'
                : 'What changed? Residents who +1’d or follow this see it on the issue page and in their updates.'
            }
            className="w-full rounded-lg border border-slate-200 p-3 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <label className={`${fieldBoxClass} py-1.5 text-xs text-slate-500`}>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="bg-transparent text-sm font-medium text-ink outline-none"
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {STATUSES[s].label}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!text.trim()}
              onClick={async () => {
                if (await postUpdate(issue.id, text.trim(), status)) {
                  setText('');
                  toast(fixing ? `${issue.id} marked fixed · neighbors will be asked to confirm` : `Update posted on ${issue.id}`);
                }
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {label}
            </button>
          </div>
        </div>
      ) : (
        <div className="pb-3" />
      )}
    </section>
  );
}

function CityCard({ issue, todo }: { issue: Issue; todo: TodoItem | null }) {
  const { nudgeCity, assign, toast, district } = useStore();
  const [forwarding, setForwarding] = useState(false);
  useEffect(() => setForwarding(false), [issue.id]);
  const req = issue.cityRequest;

  if (req) {
    // Once it's fixed or reopened, the request is a record, not something to chase.
    const waiting = issue.status === 'sent_to_city';
    const day = today();
    const wait = cityWait(req, day);
    // Orange by the to-do list's rule: no contact with the City for `cityNoReplyDays` or more.
    const late = daysBetween(req.lastFollowUp ?? req.sentOn, day) >= district.rules.cityNoReplyDays;
    const rows: [string, string, string?][] = [
      ['Filed', req.sentBy ? `${shortDate(req.sentOn)} by ${req.sentBy}` : shortDate(req.sentOn)],
      ['Agency', req.agency],
      ...(req.routedTo && req.routedTo !== req.agency ? [['Routed to', req.routedTo] as [string, string]] : []),
      ['Last follow-up', req.lastFollowUp ? shortDate(req.lastFollowUp) : 'None yet'],
      // When the to-do line above already gives this wait, it isn't said twice.
      ...(waiting && todo?.kind !== 'city'
        ? [['Waiting', wait[0].toUpperCase() + wait.slice(1), late ? 'font-medium text-brand-dark' : ''] as [string, string, string]]
        : []),
    ];
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
          <div>
            <p className={labelClass}>NYC 311 service request</p>
            <p className="mt-0.5 font-mono text-lg font-semibold">{req.sr}</p>
          </div>
          <a
            href={CHECK_311}
            target="_blank"
            rel="noreferrer"
            onClick={() => copySr(req.sr, toast)}
            title="Opens NYC 311’s status page and copies the SR number"
            className={`flex items-center gap-1 text-sm ${linkClass}`}
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
        {waiting && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
            <button
              onClick={async () => {
                if (await nudgeCity(issue.id)) toast(`Follow-up on ${req.sr} recorded`);
              }}
              className={button}
            >
              <Send className="h-4 w-4" /> Log follow-up
            </button>
            <p className="basis-full text-xs text-slate-500">
              Follow up with 311 or {req.agency} first (mention the {plural(issue.votes, 'neighbor')}), then log it here so the wait resets.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className={labelClass}>Who fixes this</p>
      {issue.agency && !forwarding && (
        <>
          <p className="mt-1 font-semibold">This is {issue.agency}’s to fix.</p>
          <p className="mt-1 text-sm text-slate-600">File it with 311, then record the SR number here to track the City’s reply.</p>
          <button onClick={() => setForwarding(true)} className={`${button} mt-3`}>
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
          <p className="mt-3 text-sm text-slate-600">
            The City handles this?{' '}
            <button onClick={() => setForwarding(true)} className={linkClass}>
              Forward to 311
            </button>
          </p>
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

const banner = 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-slate-100 px-4 py-3 text-sm';

function ModerationBanner({ issue }: { issue: Issue }) {
  const { unhideIssue, toast } = useStore();
  if (issue.mergedInto) {
    return (
      <div className={banner}>
        <GitMerge className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="flex-1">
          Merged into <span className="font-mono">{issue.mergedInto}</span>. Residents opening this link are sent there.
        </span>
        <a href={`#/org/issues/${issue.mergedInto}`} className={linkClass}>
          Open {issue.mergedInto}
        </a>
      </div>
    );
  }
  if (issue.hidden) {
    return (
      <div className={banner}>
        <EyeOff className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="flex-1">Hidden from the public{issue.hiddenReason ? `: ${issue.hiddenReason}` : ''}.</span>
        <button
          onClick={async () => {
            if (await unhideIssue(issue.id)) toast(`${issue.id} is back on the public map`);
          }}
          className={button}
        >
          <Eye className="h-4 w-4" /> Unhide
        </button>
      </div>
    );
  }
  return null;
}

function Facts({ issue }: { issue: Issue }) {
  const rows: [string, ReactNode, boolean?][] = [
    ['Owner', issue.owner ?? 'Unassigned'],
    ['Neighbors', `${issue.votes} (+${issue.votesThisWeek} this week)`],
    ['Following', issue.following],
    ['Duplicates merged', issue.duplicatesMerged],
  ];
  if (issue.status === 'fixed' || issue.confirmedFixed > 0 || issue.notFixed > 0) {
    rows.push(['Confirmed fixed', issue.confirmedFixed], ['Say it isn’t fixed', issue.notFixed, issue.notFixed > 0]);
  }
  rows.push(['Came in through', issue.via]);
  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
      {rows.map(([k, v, alert]) => (
        <div key={k} className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-slate-500">{k}</dt>
          <dd className={`text-right font-medium ${alert ? 'text-brand-dark' : ''}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One row of the list. Memoized: picking an issue re-renders two rows, a +1 one. */
const ListRow = memo(function ListRow({
  issue: i,
  note,
  urgent,
  current,
  href,
}: {
  issue: Issue;
  note?: string;
  urgent: boolean;
  current: boolean;
  href: string;
}) {
  return (
    <li>
      <button
        onClick={() => navigate(href)}
        aria-current={current ? 'true' : undefined}
        className={`block w-full border-b border-slate-100 px-4 py-3 text-left -outline-offset-2 md:px-5 ${
          current ? 'hover:bg-slate-50 md:bg-slate-100 md:hover:bg-slate-100' : 'hover:bg-slate-50'
        }`}
      >
        <span className="flex justify-between gap-3 text-xs text-slate-500">
          <span className="font-mono">{i.id}</span>
          {i.mergedInto ? (
            <span>
              merged into <span className="font-mono">{i.mergedInto}</span>
            </span>
          ) : (
            <span>{i.hidden ? 'hidden' : `pinned ${shortDate(i.createdAt)}`}</span>
          )}
        </span>
        <span className="block font-medium">{i.title}</span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
          <CategoryTag category={i.category} />
          <StatusTag status={i.status} />
          <span className="text-slate-500">{plural(i.votes, 'neighbor')}</span>
        </span>
        {note && <span className={`mt-1 block truncate text-xs ${urgent ? 'font-medium text-brand-dark' : 'text-slate-500'}`}>{note}</span>}
        {i.hidden && i.hiddenReason && <span className="mt-1 block truncate text-xs text-slate-500">{i.hiddenReason}</span>}
      </button>
    </li>
  );
});

export default function Issues({ selectedId, tab }: { selectedId?: string; tab: string }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'merge' | 'hide' | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  useEffect(() => {
    setDialog(null);
    setCompose(null);
  }, [selectedId]);

  const day = today();
  const { rules } = store.district;
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const searching = query.trim() !== '';
  const { rows, summary } = useMemo(
    () => issueList(activeTab.id, { issues: store.issues, hidden: store.hiddenIssues }, rules, day, query),
    [activeTab.id, store.issues, store.hiddenIssues, rules, day, query],
  );
  // The list mounts a page of rows at a time (a district can have thousands of issues).
  const list = useProgressive(rows, `${activeTab.id}|${query.trim()}`, 60);
  const counts = useMemo(() => {
    const pools = { issues: store.issues, hidden: store.hiddenIssues };
    return Object.fromEntries(TABS.map((t) => [t.id, tabCount(t.id, pools, rules, day)])) as Record<TabId, number>;
  }, [store.issues, store.hiddenIssues, rules, day]);

  // With nothing picked, wide screens show the first row. It stays shown while the list re-sorts
  // under it (answering an issue moves it down), until another is picked or the list changes.
  const listKey = `${activeTab.id}|${query.trim()}`;
  const [kept, setKept] = useState<{ key: string; id: string } | null>(null);
  const fallback = (kept?.key === listKey ? rows.find((r) => r.issue.id === kept.id)?.issue : undefined) ?? rows[0]?.issue;
  useEffect(() => {
    if (!selectedId && fallback && (kept?.key !== listKey || kept.id !== fallback.id)) setKept({ key: listKey, id: fallback.id });
  }, [selectedId, fallback, kept, listKey]);

  const missing = Boolean(selectedId && !store.getIssue(selectedId));
  const issue = selectedId ? store.getIssue(selectedId) : fallback;
  const todo = issue ? todoFor(issue, rules, day) : null;
  const base = activeTab.id === 'city' ? '/org/sent' : '/org/issues';
  const tabQuery = activeTab.id !== 'inbox' && activeTab.id !== 'city' ? `?tab=${activeTab.id}` : '';
  const linkFor = (id: string) => `${base}/${id}${tabQuery}`;
  const startCompose = (status?: Status) => setCompose((c) => ({ status, n: (c?.n ?? 0) + 1 }));
  // Phones show the list or one issue, never both. `selectedId` decides which.
  const showDetailOnPhone = Boolean(selectedId);
  // Don't mount the detail (and its map) while it's hidden: Leaflet can't size a map in a hidden box.
  const wide = useMediaQuery('(min-width: 768px)');
  const showDetail = wide || showDetailOnPhone;
  const age = issue ? daysBetween(issue.createdAt, day) : 0;

  return (
    <div className="flex h-full flex-col">
      <header className={`border-b border-slate-200 bg-white px-4 pt-4 md:px-6 md:pt-5 ${showDetailOnPhone ? 'hidden md:block' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="sr-only md:not-sr-only md:text-2xl md:font-bold">Issues</h1>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <SampleBadge />
            <label className={`${fieldBoxClass} min-w-0 flex-1 sm:w-64 sm:flex-none`}>
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ID, street, keyword, SR"
                className="h-9 w-full min-w-0 text-sm outline-none"
              />
            </label>
          </div>
        </div>
        <nav className="no-scrollbar -mx-4 mt-3 flex gap-5 overflow-x-auto px-4 text-sm md:mx-0 md:gap-6 md:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setQuery('');
                navigate(t.id === 'city' ? '/org/sent' : `/org/issues?tab=${t.id}`);
              }}
              aria-current={!searching && t.id === activeTab.id ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 -outline-offset-2 ${
                !searching && t.id === activeTab.id ? 'border-ink font-semibold' : 'border-transparent text-slate-600'
              }`}
            >
              {t.label} <span className="font-normal text-slate-500">{counts[t.id]}</span>
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
          <li className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 md:px-5">{summary}</li>
          {list.shown.map(({ issue: i, note }) => (
            <ListRow
              key={i.id}
              issue={i}
              note={note?.text}
              urgent={Boolean(note?.urgent)}
              current={issue?.id === i.id}
              href={linkFor(i.id)}
            />
          ))}
          {list.more && <li ref={list.sentinel} aria-hidden className="h-px" />}
          {!rows.length && (
            <li className="p-8 text-center text-sm text-slate-500">
              {searching
                ? 'Nothing matches. Try a street, a PP number or an SR number.'
                : activeTab.id === 'hidden'
                  ? 'Nothing hidden or merged.'
                  : 'No issues here.'}
            </li>
          )}
        </ul>

        {!showDetail ? null : issue ? (
          <div className={`min-w-0 flex-1 overflow-y-auto px-4 py-4 md:block md:px-6 md:py-5 ${showDetailOnPhone ? '' : 'hidden'}`}>
            <button
              onClick={() => navigate(`${base}${tabQuery}`)}
              className="-ml-1 mb-3 flex items-center gap-1 text-sm font-medium text-slate-600 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> {searching ? 'Results' : activeTab.label}
            </button>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-4">
              <div className="min-w-0 flex-1">
                <p className={labelClass}>
                  <span className="font-mono font-normal">{issue.id}</span> · {CATEGORIES[issue.category].label} · {issue.locationLabel}
                </p>
                <h2 className="mt-1 text-xl font-bold md:text-2xl">{issue.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <StatusTag status={issue.status} className="text-ink" /> · Pinned {shortDate(issue.createdAt)}
                  {/* An issue nobody has answered has waited since it was pinned, and the to-do line says how long. */}
                  {todo?.kind !== 'new' && ` · ${age === 0 ? 'today' : `${plural(age, 'day')} ago`}`}
                </p>
              </div>
              {!issue.mergedInto && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => setDialog('merge')} className={button}>
                    <GitMerge className="h-4 w-4" /> Merge
                  </button>
                  {!issue.hidden && (
                    <button onClick={() => setDialog('hide')} className={button}>
                      <EyeOff className="h-4 w-4" /> Hide
                    </button>
                  )}
                  {issue.status !== 'fixed' && (
                    <button onClick={() => startCompose('fixed')} title="Say what was done; neighbors are then asked to confirm" className={button}>
                      <Check className="h-4 w-4" /> Mark fixed…
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-5 md:mt-5 xl:grid-cols-[1fr_260px]">
              <div className="min-w-0 space-y-4">
                <ModerationBanner issue={issue} />
                {todo && <TodoLine todo={todo} onCompose={startCompose} onHide={() => setDialog('hide')} />}
                {issue.description && <p className="text-[15px] leading-relaxed text-slate-700">{issue.description}</p>}
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
                  <p className="text-sm text-slate-500">No photos with this report.</p>
                )}
                {!issue.mergedInto && <CityCard issue={issue} todo={todo} />}
                <ResidentsThread issue={issue} compose={compose} canPost={!issue.mergedInto} />
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
                <Facts issue={issue} />
                <div>
                  <h3 className={`${labelClass} mb-2`}>Activity</h3>
                  <ol className="space-y-1.5 text-sm">
                    {[...issue.history].reverse().map((h, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="w-12 shrink-0 text-slate-500">{shortDate(h.date)}</span>
                        <span>
                          {h.text}
                          {h.staffName && <span className="text-slate-500"> · {h.staffName}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
                <a href={`#/i/${issue.id}`} className={`${linkClass} inline-block text-sm`}>
                  View resident page
                </a>
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
                <button onClick={() => navigate(`${base}${tabQuery}`)} className={`${linkClass} mt-2`}>
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
