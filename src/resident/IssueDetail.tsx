import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ChevronUp, EyeOff, Share } from 'lucide-react';
import { StatusTag } from '../components/ui';
import { config } from '../config';
import { REMOVED_BY_PINNER, REPORT_REASONS, REPORT_REASON_ORDER, STATUSES } from '../data/meta';
import type { District, FollowContact, Issue, ReportReason } from '../data/types';
import { daysBetween, plural, shortDate } from '../lib/format';
import { removalBlocker } from '../lib/ownPin';
import { navigate } from '../router';
import { useStore } from '../store';
import { BUTTON, CategoryLabel, ConfirmAction, FixQuestion, LABEL, LINK, goBack, shareIssue } from './shared';

function statusCopy(issue: Issue, district: District): { title: string; body?: ReactNode } {
  const DISTRICT = district.name;
  const days = daysBetween(issue.createdAt);
  switch (issue.status) {
    case 'sent_to_city': {
      const req = issue.cityRequest;
      const who = req?.agency ?? issue.agency ?? 'A City agency';
      if (!req) return { title: 'No response from the City yet', body: `${who} is responsible for this. ${DISTRICT} sent it to the City.` };
      const wait = daysBetween(req.sentOn);
      return {
        title: 'No response from the City yet',
        body: (
          <>
            {who} is responsible for this. {DISTRICT} filed it with NYC 311 on {shortDate(req.sentOn)}
            {wait > 0 && `, ${plural(wait, 'day')} ago`}
            {req.lastFollowUp && `, and followed up on ${shortDate(req.lastFollowUp)}`}. The 311 request number is{' '}
            <span className="whitespace-nowrap font-mono">{req.sr}</span>.
          </>
        ),
      };
    }
    case 'open':
      return {
        title: days > 14 ? 'Nobody has picked this up yet' : 'New · waiting for review',
        body: `${DISTRICT} reviews every new pin. Each +1 shows them, and the City, how many neighbors it affects.`,
      };
    case 'in_review':
      return { title: `${DISTRICT} is looking into it`, body: 'They are checking who is responsible for this and what it takes to fix.' };
    case 'scheduled':
      // Only promise a message when one is really sent (config.notifications).
      return { title: 'A fix is scheduled', body: config.notifications ? 'You’ll get a note when it’s marked done.' : undefined };
    case 'fixed':
      return {
        title: issue.fixedOn ? `Marked fixed on ${shortDate(issue.fixedOn)}` : 'Marked fixed',
        body: `${plural(issue.confirmedFixed, 'neighbor')} confirmed the fix so far.${
          issue.notFixed > 0 ? ` ${plural(issue.notFixed, 'neighbor')} ${issue.notFixed === 1 ? 'says' : 'say'} it isn’t fixed.` : ''
        }`,
      };
  }
}

/** "Phone or email" field → a contact the backend can store privately. */
function parseContact(value: string): FollowContact | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return v.includes('@') ? { email: v } : { phone: v };
}

/** Every photo, one per swipe. The arrows are for screens without touch. */
function Photos({ photos }: { photos: string[] }) {
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const step = (by: number) => strip.current?.scrollBy({ left: by * strip.current.clientWidth, behavior: 'smooth' });
  const arrow = 'absolute top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white shadow disabled:opacity-0 sm:grid';
  return (
    <div className="relative">
      <div
        ref={strip}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex h-56 snap-x snap-mandatory overflow-x-auto"
      >
        {photos.map((src, i) => (
          <img key={i} src={src} alt={`Photo ${i + 1} of ${photos.length}`} className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button onClick={() => step(-1)} disabled={at === 0} aria-label="Previous photo" className={`${arrow} left-3`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => step(1)} disabled={at === photos.length - 1} aria-label="Next photo" className={`${arrow} right-3`}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {at + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}

/** On the device that pinned it: remove the pin while that's still allowed, or say in one sentence why not. */
function RemovePin({ issue }: { issue: Issue }) {
  const store = useStore();
  const blocker = removalBlocker(issue);
  if (blocker) {
    const others = issue.votes === 2 ? 'Another neighbor has' : 'Other neighbors have';
    return (
      <p>
        {blocker === 'office' ? `${store.district.name} has picked this up` : `${others} +1’d this`}, so it stays on the map. You can still add a
        note.
      </p>
    );
  }
  return (
    <ConfirmAction
      label="Remove your pin"
      question={`Remove your pin? It comes off the map for everyone. ${store.district.name} can still see it.`}
      confirmLabel="Remove pin"
      cancelLabel="Keep it"
      onConfirm={async () => {
        if (await store.removeIssue(issue.id)) {
          store.toast('Your pin was removed');
          navigate('/');
        }
      }}
    />
  );
}

/** "Report this pin": one report per device, a reason from a short list, seen only by the district office. */
function ReportPin({ issue }: { issue: Issue }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) first.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (store.reported.includes(issue.id)) {
    return (
      <p className="text-sm text-slate-600">
        You reported this pin. {store.district.name} will review it.
      </p>
    );
  }
  if (!open) {
    return (
      <button ref={opener} onClick={() => setOpen(true)} className={`text-sm ${LINK}`}>
        Report this pin
      </button>
    );
  }
  return (
    <form
      className="rounded-xl border border-slate-200 p-4"
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reason) return;
        setBusy(true);
        if (await store.reportIssue(issue.id, reason)) store.toast('Report sent');
        setBusy(false);
      }}
    >
      <fieldset>
        <legend className="font-semibold">Why are you reporting this pin?</legend>
        <p className="mt-0.5 text-sm text-slate-600">Only {store.district.name} sees reports.</p>
        <div className="mt-2">
          {REPORT_REASON_ORDER.map((r, n) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[15px]">
              <input
                ref={n === 0 ? first : undefined}
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-4 w-4 accent-ink"
              />
              {REPORT_REASONS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex items-center gap-4">
        <button disabled={!reason || busy} className={`${BUTTON} px-4 py-2 text-sm disabled:opacity-50`}>
          Send report
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`text-sm ${LINK}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function IssueDetail({ id }: { id?: string }) {
  const store = useStore();
  const { district, track } = store;
  const issue = id ? store.getIssue(id) : undefined;
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const exists = Boolean(issue);

  useEffect(() => {
    if (id && exists) track({ name: 'issue_view', issueId: id });
  }, [id, exists]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-slate-600">This problem doesn’t exist (yet).</p>
        <button className={LINK} onClick={() => navigate('/')}>
          Back to the map
        </button>
      </div>
    );
  }

  if (issue.mergedInto) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-slate-600">
          {district.name} merged this pin into <span className="font-mono">{issue.mergedInto}</span>, which reports the same problem.
          Its +1s and followers moved with it.
        </p>
        <button className={LINK} onClick={() => navigate(`/i/${issue.mergedInto}`)}>
          Open <span className="font-mono">{issue.mergedInto}</span>
        </button>
      </div>
    );
  }

  const voted = store.voted.includes(issue.id);
  const following = store.following.includes(issue.id);
  // The device that pinned it keeps its +1 and stays on it under Your updates.
  const mine = Boolean(issue.isUserReport);
  const yourUpdates = (
    <a href="#/updates" className={LINK}>
      Your updates
    </a>
  );
  // Where this device's problems are kept. The account is offered elsewhere (Your updates, a new pin's
  // card), never on the way to a +1.
  const where = store.account ? 'in your account' : 'on this phone';
  const status = STATUSES[issue.status];
  const copy = statusCopy(issue, district);
  const rank =
    [...store.issues].filter((i) => i.status !== 'fixed').sort((a, b) => b.votes - a.votes).findIndex((i) => i.id === issue.id) + 1;

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-3 py-2">
        <button onClick={goBack} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={() => shareIssue(issue, store, 'detail')} className={`${BUTTON} mr-2 flex items-center gap-1.5 px-3 py-1.5 text-sm`}>
          <Share className="h-4 w-4" /> Share
        </button>
      </header>

      {issue.photos.length > 0 && <Photos photos={issue.photos} />}

      {issue.hidden && (
        <p className="flex items-center gap-2 border-y border-slate-200 px-5 py-2.5 text-sm text-slate-600">
          <EyeOff className="h-4 w-4 shrink-0" />
          {issue.hiddenReason === REMOVED_BY_PINNER
            ? `${REMOVED_BY_PINNER}. Only staff can see this.`
            : `Hidden by staff${issue.hiddenReason ? `: ${issue.hiddenReason}` : ''}. Only staff can see this.`}
        </p>
      )}

      <div className="space-y-6 px-5 pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-mono">{issue.id}</span> · <CategoryLabel category={issue.category} iconClass="h-3.5 w-3.5 text-slate-500" />
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{issue.title}</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            {issue.locationDetail ?? issue.locationLabel} · pinned {shortDate(issue.createdAt)}
          </p>
          {issue.description && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{issue.description}</p>}
        </div>

        <div>
          {issue.status === 'fixed' ? (
            <FixQuestion issue={issue} />
          ) : voted ? (
            <p className="flex items-center justify-center gap-1.5 rounded-lg border border-brand px-4 py-2.5 font-semibold text-brand">
              <Check className="h-4 w-4" strokeWidth={2.5} /> You +1’d this
            </p>
          ) : (
            <button
              onClick={() => store.vote(issue.id, 'detail')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark"
            >
              <ChevronUp className="h-4 w-4" strokeWidth={2.5} /> +1 This is my problem too
            </button>
          )}
          <p className="mt-2 text-sm text-slate-600">
            {issue.votes === 0
              ? 'No +1s yet'
              : voted && issue.votes === 1
                ? mine
                  ? 'No one else has +1’d this yet'
                  : 'You’re the first neighbor to +1 this'
                : `${plural(issue.votes, 'neighbor')} +1’d this`}
            {/* A rank only says something near the top. */}
            {rank === 1 && ` · most +1’d open problem in ${district.area}`}
            {(rank === 2 || rank === 3) && ` · #${rank} most +1’d open problem in ${district.area}`}
          </p>
          {/* Not on your own pin, and not from the map list, where a stray tap would undo it. */}
          {voted && !mine && issue.status !== 'fixed' && !issue.hidden && (
            <button
              onClick={async () => {
                if (await store.unvote(issue.id)) store.toast('Your +1 is taken back');
              }}
              className={`mt-1.5 text-sm ${LINK}`}
            >
              Take back your +1
            </button>
          )}
        </div>

        <div className="rounded-xl border p-4" style={{ background: status.soft, borderColor: `${status.color}55` }}>
          <StatusTag status={issue.status} resident className="text-sm font-medium" />
          <p className="mt-1.5 text-lg font-bold leading-snug">{copy.title}</p>
          {copy.body && <p className="mt-1 text-sm leading-relaxed text-slate-700">{copy.body}</p>}
          {/* The City agency that owns it, once known. Who at the district office holds it is for staff. */}
          {issue.agency && issue.status !== 'sent_to_city' && issue.status !== 'fixed' && (
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{issue.agency} is responsible for this.</p>
          )}
          <p className="mt-3 text-xs text-slate-600">Problem Pins status, tracked by {district.name}. Not an official NYC 311 status.</p>
        </div>

        <section>
          <h2 className={`${LABEL} mb-2`}>History</h2>
          <ol className="space-y-2.5">
            {issue.history
              .filter((h) => !h.staffOnly)
              .map((h, idx) => (
                <li key={idx} className="flex gap-3 text-[15px]">
                  <span className="w-12 shrink-0 pt-0.5 text-xs text-slate-500">{shortDate(h.date)}</span>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{h.text}</span>
                </li>
              ))}
            {issue.status !== 'fixed' && (
              <li className="flex gap-3 text-[15px] text-slate-500">
                <span className="w-12 shrink-0" />
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full border border-slate-400" />
                <span>Fixed, then confirmed by neighbors</span>
              </li>
            )}
          </ol>
        </section>

        <section>
          <h2 className={LABEL}>Updates</h2>
          {issue.updates.map((u) => (
            <div key={u.id} className="border-b border-slate-100 py-3">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold">{u.author}</span>
                <span className="text-xs text-slate-500">
                  {u.role === 'partner' && 'District office · '}
                  {shortDate(u.date)}
                </span>
              </p>
              <p className="mt-0.5 text-[15px] leading-relaxed text-slate-700">{u.text}</p>
              {u.mine && (
                <ConfirmAction
                  label="Delete"
                  question="Delete this note? It can’t be brought back."
                  confirmLabel="Delete note"
                  className="mt-1 text-sm"
                  onConfirm={async () => {
                    if (await store.deleteNote(issue.id, u.id)) store.toast('Note deleted');
                  }}
                />
              )}
            </div>
          ))}
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              if (await store.addComment(issue.id, note.trim())) {
                setNote('');
                store.toast('Note added');
              }
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Add what you’ve seen…"
              aria-label="Add a note"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-ink"
            />
            <button className={`${BUTTON} px-3 text-sm`}>Post</button>
          </form>
        </section>

        {!config.notifications ? (
          // No texts or emails are sent yet: a problem is under Your updates while this phone pinned it,
          // +1’d it or follows it, and the sentence says which. Stopping a follow is offered only where
          // it takes the problem off Your updates or leaves the +1 as the reason it stays.
          mine ? (
            <div className="space-y-2 text-sm leading-relaxed text-slate-600">
              <p>You pinned this. Changes show under {yourUpdates} {where}.</p>
              {!issue.hidden && <RemovePin issue={issue} />}
            </div>
          ) : following ? (
            <div className="text-sm leading-relaxed text-slate-600">
              <p>You’re following this. Changes show under {yourUpdates} {where}.</p>
              <button
                onClick={async () => {
                  if (await store.unfollow(issue.id)) store.toast('You’re no longer following this');
                }}
                className={`mt-1.5 ${LINK}`}
              >
                Stop following
              </button>
            </div>
          ) : voted ? (
            <p className="text-sm leading-relaxed text-slate-600">You +1’d this, so changes show under {yourUpdates} {where}.</p>
          ) : (
            <section className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
              <div className="flex-1">
                <h2 className="font-semibold">Follow this problem</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {store.account ? 'It stays under Your updates, in your account.' : 'It stays under Your updates on this phone. No account needed.'}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (await store.follow(issue.id)) store.toast('Following this problem');
                }}
                className={`${BUTTON} shrink-0 px-4 py-2 text-sm`}
              >
                Follow
              </button>
            </section>
          )
        ) : following ? (
          <div className="text-sm leading-relaxed text-slate-600">
            <p>You’ll get a text or email when this changes.</p>
            {/* Stopping also deletes the phone number or email left for it. */}
            <button
              onClick={async () => {
                if (await store.unfollow(issue.id)) store.toast('You won’t get messages about this any more');
              }}
              className={`mt-1.5 ${LINK}`}
            >
              Stop following
            </button>
            {mine && !issue.hidden && (
              <div className="mt-2">
                <RemovePin issue={issue} />
              </div>
            )}
          </div>
        ) : (
          <section className="rounded-xl border border-slate-200 p-4">
            <h2 className="mb-2 font-semibold">Get a text or email when this changes</h2>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await store.follow(issue.id, parseContact(contact))) {
                  store.toast(contact ? `We’ll notify ${contact}` : 'Following this problem');
                }
              }}
            >
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Phone or email"
                aria-label="Phone or email"
                className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 outline-none focus:border-ink"
              />
              <button className={`${BUTTON} px-4`}>Notify me</button>
            </form>
            <p className="mt-2 text-xs text-slate-500">No account. Unsubscribe from any message.</p>
          </section>
        )}

        {/* Reporting your own pin makes no sense: you can remove it, or add a note. */}
        {!mine && !issue.hidden && <ReportPin issue={issue} />}

        <p className="text-sm">
          <a href="#/about" className={LINK}>
            About Problem Pins
          </a>
        </p>
      </div>
    </div>
  );
}
