import { ArrowLeft, Check, Landmark, Send, User } from 'lucide-react';
import { Logo, StatusTag } from '../components/ui';
import { config, residentAccounts } from '../config';
import { STATUSES } from '../data/meta';
import { daysBetween, plural, shortDate, today } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';
import { FixQuestion, LABEL, LINK, residentHistory } from './shared';

interface FeedItem {
  key: string;
  issueId: string;
  date: string;
  title: string;
  body: string;
  kind: 'district' | 'fixed' | 'city' | 'resident' | 'event';
}

// Color only where it is a status: a fix, or a hand-off to the City.
const ICONS = {
  district: { Icon: Landmark, color: undefined },
  fixed: { Icon: Check, color: STATUSES.fixed.color },
  city: { Icon: Send, color: STATUSES.sent_to_city.color },
  resident: { Icon: User, color: undefined },
  event: { Icon: Check, color: undefined },
};

export default function Updates() {
  const store = useStore();
  const now = today();
  // A problem is here while this phone pinned it, +1’d it or follows it.
  const followedIds = new Set([...store.voted, ...store.following]);
  const followed = store.issues.filter((i) => followedIds.has(i.id) || i.isUserReport);
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
        kind: u.role === 'partner' ? 'district' : 'resident',
      })),
    ...residentHistory(issue.history)
      .filter((h) => !h.text.startsWith('Pinned'))
      .map<FeedItem>((h, idx) => {
        const fixed = h.text.startsWith('Marked fixed');
        return {
          key: `${issue.id}-h${idx}`,
          issueId: issue.id,
          date: h.date,
          // The log names the problem's owner, which can be a City agency. The district office marks it here.
          title: fixed ? `Marked fixed by ${store.district.name}` : h.text.split(' · ')[0],
          body: issue.title,
          kind: fixed ? 'fixed' : /City|311/.test(h.text) ? 'city' : 'event',
        };
      }),
  ]);
  feed.sort((a, b) => b.date.localeCompare(a.date));

  const todays = feed.filter((f) => f.date === now);
  const earlier = feed.filter((f) => f.date !== now && daysBetween(f.date) <= 30);

  const Group = ({ label, items }: { label: string; items: FeedItem[] }) =>
    items.length ? (
      <section className="mt-6">
        <h2 className={LABEL}>{label}</h2>
        {items.map((f) => {
          const { Icon, color } = ICONS[f.kind];
          return (
            <button
              key={f.key}
              onClick={() => navigate(`/i/${f.issueId}`)}
              className="flex w-full gap-3 border-b border-slate-100 py-3 text-left"
            >
              <Icon className="mt-1 h-4 w-4 shrink-0 text-slate-500" style={{ color }} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{f.title}</span>
                <span className="line-clamp-2 block text-sm text-slate-600">{f.body}</span>
              </span>
              <span className="pt-0.5 text-xs text-slate-500">{shortDate(f.date)}</span>
            </button>
          );
        })}
      </section>
    ) : null;

  return (
    <div className="px-5 pb-8 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate('/')} aria-label="Back to map">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Logo />
      </div>

      <h1 className="text-2xl font-bold">Your updates</h1>
      {followed.length > 0 && (
        <p className="mt-1 text-slate-600">
          {/* Signed in, the line below says where they are kept. */}
          {store.account ? '' : config.notifications ? 'Sent to your phone · ' : 'On this phone · '}
          {plural(followed.length, 'problem')} you pinned, +1’d or follow
        </p>
      )}
      {residentAccounts && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {store.account ? (
            <>
              Signed in as {store.account.email} ·{' '}
              <a href="#/account" className={LINK}>
                Account
              </a>
            </>
          ) : followed.length ? (
            <>
              <a href="#/account?next=/updates&from=updates" className={LINK}>
                Keep this list with your email
              </a>
              , so a new phone or a cleared browser still has it.
            </>
          ) : (
            <>
              Saved problems with your email before?{' '}
              <a href="#/account?next=/updates&from=updates" className={LINK}>
                Sign in
              </a>
            </>
          )}
        </p>
      )}

      {toConfirm.map((issue) => (
        <div key={issue.id} className="mt-4 rounded-xl border border-slate-200 p-4">
          <FixQuestion issue={issue} named>
            <p className="mt-1 text-sm text-slate-600">
              {store.district.name} marked this fixed{issue.fixedOn ? ` on ${shortDate(issue.fixedOn)}` : ''}. You{' '}
              {issue.isUserReport ? 'pinned' : store.voted.includes(issue.id) ? '+1’d' : 'followed'} it; help confirm whether it’s
              really done.
            </p>
          </FixQuestion>
        </div>
      ))}

      <Group label="Today" items={todays} />
      <Group label="Earlier" items={earlier} />

      {/* What the feed is about. The device doesn't record when a +1 or a follow happened, so
          these are a plain list with each problem's status today, not dated events. */}
      {followed.length > 0 && (
        <section className="mt-6">
          <h2 className={LABEL}>Your problems</h2>
          {followed.map((issue) => (
            <button
              key={issue.id}
              onClick={() => navigate(`/i/${issue.id}`)}
              className="block w-full border-b border-slate-100 py-3 text-left"
            >
              <span className="block font-semibold">{issue.title}</span>
              <span className="block text-sm text-slate-600">
                <StatusTag status={issue.status} resident /> ·{' '}
                {issue.isUserReport ? 'you pinned it' : store.voted.includes(issue.id) ? 'you +1’d it' : 'you follow it'}
              </span>
            </button>
          ))}
        </section>
      )}

      {!followed.length && (
        <p className="mt-8 text-slate-600">
          +1, follow or pin a problem and its updates will show up here.{' '}
          <button onClick={() => navigate('/')} className={LINK}>
            Open the map
          </button>
        </p>
      )}
    </div>
  );
}
