import { ArrowLeft, Check, ChevronUp, Landmark, Send, User } from 'lucide-react';
import { Logo } from '../components/ui';
import { daysBetween, shortDate, today } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

interface FeedItem {
  key: string;
  issueId: string;
  date: string;
  title: string;
  body: string;
  kind: 'partner' | 'fixed' | 'city' | 'vote' | 'resident' | 'event';
}

const ICONS = {
  partner: { Icon: Landmark, cls: 'bg-violet-100 text-violet-700' },
  fixed: { Icon: Check, cls: 'bg-emerald-100 text-emerald-700' },
  city: { Icon: Send, cls: 'bg-orange-100 text-brand' },
  vote: { Icon: ChevronUp, cls: 'bg-slate-100 text-slate-600' },
  resident: { Icon: User, cls: 'bg-slate-100 text-slate-600' },
  event: { Icon: Check, cls: 'bg-slate-100 text-slate-600' },
};

export default function Updates() {
  const store = useStore();
  const now = today();
  const followedIds = new Set([...store.voted, ...store.following]);
  const followed = store.issues.filter((i) => followedIds.has(i.id));
  const toConfirm = followed.filter((i) => i.status === 'fixed' && !store.confirmed[i.id]);

  const feed: FeedItem[] = followed.flatMap((issue) => [
    ...issue.updates
      .filter((u) => !u.mine)
      .map<FeedItem>((u) => ({
        key: u.id,
        issueId: issue.id,
        date: u.date,
        title: u.role === 'partner' ? `${u.author} posted an update` : `${u.author} added a note`,
        body: u.text,
        kind: u.role === 'partner' ? 'partner' : 'resident',
      })),
    ...issue.history
      .filter((h) => !h.text.startsWith('Pinned'))
      .map<FeedItem>((h, idx) => ({
        key: `${issue.id}-h${idx}`,
        issueId: issue.id,
        date: h.date,
        title: h.text.startsWith('Marked fixed') ? h.text : h.text.split(' · ')[0],
        body: issue.title,
        kind: h.text.startsWith('Marked fixed') ? 'fixed' : /City|311/.test(h.text) ? 'city' : 'event',
      })),
    ...(store.voted.includes(issue.id) && !issue.isUserReport
      ? [{ key: `${issue.id}-vote`, issueId: issue.id, date: now, title: 'You +1’d a problem', body: issue.title, kind: 'vote' as const }]
      : []),
  ]);
  feed.sort((a, b) => b.date.localeCompare(a.date));

  const todays = feed.filter((f) => f.date === now);
  const earlier = feed.filter((f) => f.date !== now && daysBetween(f.date) <= 30);

  const Group = ({ label, items }: { label: string; items: FeedItem[] }) =>
    items.length ? (
      <section className="mt-5">
        <h2 className="mb-1 font-mono text-[11px] tracking-wider text-slate-500">{label}</h2>
        {items.map((f) => {
          const { Icon, cls } = ICONS[f.kind];
          return (
            <button
              key={f.key}
              onClick={() => navigate(`/i/${f.issueId}`)}
              className="flex w-full gap-3 border-b border-slate-100 py-3 text-left"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{f.title}</span>
                <span className="line-clamp-2 block text-sm text-slate-600">{f.body}</span>
              </span>
              <span className="font-mono text-[11px] text-slate-400">{shortDate(f.date)}</span>
            </button>
          );
        })}
      </section>
    ) : null;

  return (
    <div className="px-5 pb-8 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} aria-label="Back to map">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Logo />
        </div>
        <span className="font-mono text-xs text-slate-400">{shortDate(now)}</span>
      </div>

      <h1 className="text-3xl font-bold">Your updates</h1>
      <p className="mt-1 text-slate-500">
        Sent to your phone · following {followed.length} problem{followed.length === 1 ? '' : 's'}
      </p>

      {toConfirm.map((issue) => (
        <div key={issue.id} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Check className="h-5 w-5 text-emerald-700" /> Is “{issue.title}” fixed?
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {issue.owner ?? 'The District'} marked this fixed. You +1’d it; help confirm whether it’s really done.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                if (await store.confirmFix(issue.id, 'yes')) store.toast('Thanks for confirming!');
              }}
              className="rounded-lg bg-emerald-700 py-2.5 font-semibold text-white"
            >
              Yes, it’s fixed
            </button>
            <button
              onClick={async () => {
                if (await store.confirmFix(issue.id, 'no')) store.toast(`Got it. We’ll let ${store.district.name} know.`);
              }}
              className="rounded-lg border border-slate-200 bg-white py-2.5 font-semibold"
            >
              Still broken
            </button>
          </div>
        </div>
      ))}

      <Group label="TODAY" items={todays} />
      <Group label="EARLIER" items={earlier} />

      {!followed.length && (
        <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          +1 or pin a problem and its updates will show up here.
          <button onClick={() => navigate('/')} className="mt-3 block w-full font-semibold text-brand">
            Open the map
          </button>
        </div>
      )}
    </div>
  );
}
