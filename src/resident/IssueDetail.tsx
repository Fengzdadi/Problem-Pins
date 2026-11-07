import { useState } from 'react';
import { ArrowLeft, Check, ChevronUp, Landmark, User } from 'lucide-react';
import { PhotoThumb } from '../components/ui';
import { CATEGORIES, DISTRICT, STATUSES } from '../data/meta';
import type { Issue } from '../data/types';
import { daysBetween, shortDate } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

function statusCopy(issue: Issue) {
  const days = daysBetween(issue.createdAt);
  switch (issue.status) {
    case 'sent_to_city': {
      const req = issue.cityRequest;
      return {
        title: 'No response from the City yet',
        body: `This is ${req?.agency ?? 'a City'}-owned, so ${DISTRICT} can’t fix it directly. They sent it to NYC 311${
          req ? ` on ${shortDate(req.sentOn)}` : ''
        }.`,
      };
    }
    case 'open':
      return {
        title: days > 14 ? 'Nobody has picked this up yet' : 'New · waiting for review',
        body: `${DISTRICT} reviews problems with 50+ neighbors or that stay open 30+ days. Every +1 moves it up their list.`,
      };
    case 'in_review':
      return { title: `${issue.owner ?? DISTRICT} is looking into it`, body: 'They are checking who owns this and what it takes to fix.' };
    case 'scheduled':
      return { title: `${issue.owner ?? DISTRICT} has it scheduled`, body: 'A fix is on the schedule. You’ll get a note when it’s marked done.' };
    case 'fixed':
      return {
        title: 'Marked fixed',
        body: `${issue.confirmedFixed} neighbor${issue.confirmedFixed === 1 ? '' : 's'} confirmed the fix so far.`,
      };
  }
}

export default function IssueDetail({ id }: { id?: string }) {
  const store = useStore();
  const issue = id ? store.getIssue(id) : undefined;
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');

  if (!issue) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-slate-500">This problem doesn’t exist (yet).</p>
        <button className="font-semibold text-brand" onClick={() => navigate('/')}>
          Back to the map
        </button>
      </div>
    );
  }

  const voted = store.voted.includes(issue.id);
  const following = store.following.includes(issue.id);
  const status = STATUSES[issue.status];
  const copy = statusCopy(issue);
  const rank =
    [...store.issues].filter((i) => i.status !== 'fixed').sort((a, b) => b.votes - a.votes).findIndex((i) => i.id === issue.id) + 1;

  return (
    <div className="pb-8">
      <div className="relative h-56">
        <PhotoThumb issue={issue} className="h-full w-full" />
        <button
          onClick={() => (history.length > 1 ? history.back() : navigate('/'))}
          className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white shadow"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {issue.photos.length > 0 && (
          <span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">
            1 / {issue.photos.length}
          </span>
        )}
      </div>

      {voted && (
        <div className="flex items-center gap-2 bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-800">
          <Check className="h-4 w-4" /> Your +1 is in. {issue.votes} neighbors now.
        </div>
      )}

      <div className="space-y-5 px-5 pt-4">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-slate-500">
            {issue.id} · {CATEGORIES[issue.category].label.toUpperCase()}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{issue.title}</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            {issue.locationDetail ?? issue.locationLabel} · first pinned {shortDate(issue.createdAt)}
          </p>
          {issue.description && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{issue.description}</p>}
        </div>

        <div className="flex items-center gap-3">
          {voted ? (
            <span className="flex items-center gap-1.5 rounded-lg border-2 border-brand bg-brand-soft px-4 py-2 font-semibold text-brand">
              <ChevronUp className="h-4 w-4" strokeWidth={2.5} /> You +1’d · {issue.votes}
            </span>
          ) : (
            <button
              onClick={() => store.vote(issue.id)}
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark"
            >
              <ChevronUp className="h-4 w-4" strokeWidth={2.5} /> +1 This is my problem too · {issue.votes}
            </button>
          )}
          {rank > 0 && (
            <p className="text-sm leading-snug text-slate-600">
              {rank === 1 ? 'Most +1’d problem in West Chelsea this month' : `#${rank} most +1’d problem nearby`}
            </p>
          )}
        </div>

        <div className="rounded-xl border p-4" style={{ background: status.soft, borderColor: `${status.color}55` }}>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: status.color }} />
              {status.residentLabel}
            </span>
            {issue.owner && <span className="font-mono text-[11px] text-slate-500">{issue.owner.toUpperCase()}</span>}
          </div>
          <p className="mt-1.5 text-lg font-bold">{copy.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{copy.body}</p>
          {issue.cityRequest && issue.status === 'sent_to_city' && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-black/10 border-t border-black/10 pt-3 text-sm">
              <div className="pr-2">
                <p className="font-mono text-[10px] text-slate-500">WAITING</p>
                <p className="font-semibold">{daysBetween(issue.cityRequest.sentOn)} days</p>
              </div>
              <div className="px-2">
                <p className="font-mono text-[10px] text-slate-500">311 REQUEST</p>
                <p className="font-semibold">{issue.cityRequest.sr}</p>
              </div>
              <div className="pl-2">
                <p className="font-mono text-[10px] text-slate-500">NEIGHBORS</p>
                <p className="font-semibold">{issue.votes}</p>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">Problem Pins status, tracked by {DISTRICT}. Not an official NYC 311 status.</p>
        </div>

        <section>
          <h2 className="mb-2 font-mono text-[11px] tracking-wider text-slate-500">HISTORY</h2>
          <ol className="space-y-2.5">
            {issue.history.map((h, idx) => (
              <li key={idx} className="flex gap-3 text-[15px]">
                <span className="w-14 shrink-0 pt-0.5 font-mono text-[11px] text-slate-500">{shortDate(h.date).toUpperCase()}</span>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
                <span>{h.text}</span>
              </li>
            ))}
            {issue.status !== 'fixed' && (
              <li className="flex gap-3 text-[15px] text-slate-400">
                <span className="w-14 shrink-0 font-mono text-[11px]">—</span>
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full border border-slate-400" />
                <span>Fixed, then confirmed by neighbors</span>
              </li>
            )}
          </ol>
        </section>

        <section>
          <h2 className="mb-1 font-mono text-[11px] tracking-wider text-slate-500">UPDATES · {issue.updates.length}</h2>
          {issue.updates.map((u) => (
            <div key={u.id} className="flex gap-3 border-b border-slate-100 py-3">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  u.role === 'partner' ? 'bg-brand-soft text-brand' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {u.role === 'partner' ? <Landmark className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div>
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  {u.author}
                  {u.role === 'partner' && (
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-brand">PARTNER</span>
                  )}
                  <span className="font-mono text-[11px] font-normal text-slate-400">{shortDate(u.date)}</span>
                </p>
                <p className="mt-0.5 text-[15px] leading-relaxed text-slate-700">{u.text}</p>
              </div>
            </div>
          ))}
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              store.addComment(issue.id, note.trim());
              setNote('');
              store.toast('Note added');
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add what you’ve seen…"
              className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand"
            />
            <button className="rounded-lg border border-slate-200 px-3 text-sm font-medium hover:border-slate-300">Post</button>
          </form>
        </section>

        <section className="rounded-xl bg-slate-50 p-4">
          {following ? (
            <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700">
              <Check className="h-4 w-4" /> You’ll get a text or email when this changes.
            </p>
          ) : (
            <>
              <p className="mb-2 font-semibold">Get a text or email when this changes</p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  store.follow(issue.id);
                  store.toast(contact ? `We’ll notify ${contact}` : 'Following this problem');
                }}
              >
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone or email"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-brand"
                />
                <button className="rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-dark">Notify me</button>
              </form>
              <p className="mt-2 text-xs text-slate-500">No account. Unsubscribe from any message.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
