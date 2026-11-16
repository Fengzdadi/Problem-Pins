import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, QrCode } from 'lucide-react';
import { SampleBadge, labelClass, linkClass } from '../components/ui';
import { config } from '../config';
import type { AnalyticsEvent, AttentionRules } from '../data/types';
import { EXPERIMENT_THRESHOLDS } from '../lib/experimentSettings';
import { addDays, formatHours, plural, today } from '../lib/format';
import { checkThreshold } from '../lib/metrics';
import { displayLink } from '../lib/qr';
import { navigate } from '../router';
import { useStore } from '../store';
import { TodoAction } from './actions';
import { TODO_GROUPS, cityFigures, firstResponse, fixedFigures, todoList, waited, type TodoItem } from './dashboard';

const card = 'rounded-xl border border-slate-200 bg-white';
const button = 'flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:border-slate-300';

/** "Thursday, Nov 13" */
function dayLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * The staff home page for a community district office: who is waiting on the office today, and
 * three figures for how it's going. Monthly figures live in Reports; scans per poster on the QR posters page.
 */
export default function Overview() {
  const { issues, hiddenIssues, district, listEvents } = useStore();
  const now = today();
  const [events, setEvents] = useState<AnalyticsEvent[] | null>(null);

  // Analytics for the response times, this 30-day window and the one before. Loaded once per visit: they move slowly.
  useEffect(() => {
    let current = true;
    void listEvents(addDays(now, -61)).then((e) => current && setEvents(e));
    return () => {
      current = false;
    };
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const todo = useMemo(() => todoList(issues, district.rules, now), [issues, district.rules, now]);
  const nothingPinned = issues.length === 0 && hiddenIssues.length === 0;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-5 md:px-8 md:py-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={labelClass}>{dayLabel(now)}</p>
          <h1 className="text-xl font-bold md:text-2xl">{district.name}</h1>
        </div>
        <SampleBadge />
      </header>

      {nothingPinned ? (
        <GetStarted />
      ) : (
        <>
          <Figures events={events} />
          <section className={card}>
            <div className="border-b border-slate-100 px-4 py-3.5 md:px-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">To do</h2>
                <span className="text-sm text-slate-500">{todo.length}</span>
              </div>
              {todo.length > 0 && <TodoSummary items={todo} />}
            </div>
            {todo.length ? <TodoGroups items={todo} rules={district.rules} /> : <AllClear rules={district.rules} />}
          </section>
          <p className="text-sm text-slate-500">
            Monthly figures, fix times and what’s waiting on each agency are in{' '}
            <a href="#/org/reports" className={linkClass}>
              Reports
            </a>
          </p>
        </>
      )}
    </div>
  );
}

function Figures({ events }: { events: AnalyticsEvent[] | null }) {
  const { issues } = useStore();
  const now = today();
  const city = cityFigures(issues, now);
  const fixed = fixedFigures(issues, now);
  const response = events && firstResponse(events, now);
  const before = events && firstResponse(events, addDays(now, -30));
  const target = EXPERIMENT_THRESHOLDS.staffResponseHours;

  let responseNote = 'Loading…';
  let responseTone = 'text-slate-500';
  if (response && !response.pins) responseNote = 'No new issues in the last 30 days';
  else if (response) {
    const parts = [response.responded ? 'Last 30 days' : 'Last 30 days · none answered yet'];
    // Against the 30 days before, in words: lower is better.
    if (response.responded && before?.responded) {
      const [shown, was] = [formatHours(response.medianHours), formatHours(before.medianHours)];
      if (shown === was) parts.push('same as the 30 days before');
      else parts.push(`${response.medianHours! < before.medianHours! ? 'down' : 'up'} from ${was}`);
    }
    if (target.value !== null) {
      parts.push(`target ${target.value} h`);
      if (checkThreshold(response.medianHours, target) === 'misses') responseTone = 'text-brand-dark';
    }
    responseNote = parts.join(' · ');
  }

  return (
    <div className={`${card} grid gap-px overflow-hidden bg-slate-200 sm:grid-cols-3`}>
      <Figure
        label="Median first response"
        value={response ? formatHours(response.medianHours) : '…'}
        note={responseNote}
        tone={responseTone}
      />
      <Figure
        label="Waiting on the City"
        value={city.count}
        note={
          city.count
            ? `Oldest ${plural(city.oldestDays!, 'day')} · ${city.byAgency.map((a) => `${a.agency} ${a.count}`).join(', ')}`
            : 'Nothing with the City right now'
        }
        onClick={() => navigate('/org/sent')}
      />
      <Figure
        label="Fixed in the last 30 days"
        value={fixed.count}
        note={
          fixed.count
            ? `${fixed.confirmed} confirmed by neighbors${fixed.disputed ? ` · ${fixed.disputed} disputed` : ''}`
            : 'Nothing marked fixed in that time'
        }
        onClick={() => navigate('/org/issues?tab=fixed')}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone = 'text-slate-500',
  onClick,
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className={`flex items-center gap-1 ${labelClass}`}>
        {label}
        {onClick && <ArrowRight className="h-3 w-3" />}
      </p>
      <p className="mt-1 text-2xl font-bold md:text-3xl">{value}</p>
      <p className={`mt-1 text-xs ${tone}`}>{note}</p>
    </>
  );
  const box = 'bg-white px-4 py-3.5 text-left md:px-5 md:py-4';
  return onClick ? (
    <button onClick={onClick} className={`${box} hover:bg-slate-50`}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** One chip per group, so the shape of the day shows before any scrolling. */
function TodoSummary({ items }: { items: TodoItem[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {TODO_GROUPS.map((group) => {
        const count = items.filter((t) => t.kind === group.kind).length;
        if (!count) return null;
        return (
          <button
            key={group.kind}
            onClick={() => document.getElementById(`todo-${group.kind}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 hover:text-ink"
          >
            {group.title}
            <span className="font-semibold tabular-nums text-ink">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function TodoGroups({ items, rules }: { items: TodoItem[]; rules: AttentionRules }) {
  const groups = TODO_GROUPS.map((group) => {
    const rows = items.filter((t) => t.kind === group.kind);
    if (!rows.length) return null;
    return (
      <div key={group.kind}>
        <div
          id={`todo-${group.kind}`}
          className="flex scroll-mt-3 flex-wrap items-baseline gap-x-2 border-b border-slate-100 bg-slate-50 px-4 py-2 md:px-5"
        >
          <h3 className="text-sm font-semibold">{group.title}</h3>
          <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">{group.rule(rules)}</span>
        </div>
        {rows.map((t) => (
          // The title is the link; it is stretched over the row, so the whole row opens the issue and the action stays its own button.
          <div
            key={t.issue.id}
            className="relative flex flex-col items-start gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 md:px-5"
          >
            <div className="w-full min-w-0 flex-1">
              <p className="sm:truncate">
                <span className="mr-2 font-mono text-xs text-slate-500">{t.issue.id}</span>
                <a
                  href={`#/org/issues/${t.issue.id}`}
                  className="font-semibold outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink"
                >
                  {t.issue.title}
                </a>
              </p>
              <p className="text-sm font-semibold sm:hidden">{t.days ? `Waiting ${waited(t.days)}` : 'Today'}</p>
              <p className="mt-0.5 text-sm text-slate-500 sm:truncate">{t.reason}</p>
            </div>
            <p className="hidden w-[72px] shrink-0 text-right text-sm font-semibold tabular-nums sm:block">{waited(t.days)}</p>
            <TodoAction item={t} />
          </div>
        ))}
      </div>
    );
  });
  return <>{groups}</>;
}

function AllClear({ rules }: { rules: AttentionRules }) {
  return (
    <div className="px-4 py-10 text-center md:px-5">
      <Check className="mx-auto h-6 w-6 text-slate-400" />
      <p className="mt-2 font-semibold">Nothing is waiting on you</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Pins residents reported, issues nobody has answered, residents waiting for a reply, City requests with no follow-up in{' '}
        {rules.cityNoReplyDays}+ days, and issues with nothing new for residents in {rules.quietDays}+ days show up here.
      </p>
    </div>
  );
}

/** Day one of a pilot: no pins yet, so the page helps get the first ones in. */
function GetStarted() {
  const { scanPoints, toast } = useStore();
  const link = config.publicUrl;
  const posters = scanPoints.length;
  const steps: { title: string; body: string; done?: boolean; action: ReactNode }[] = [
    {
      title: 'Put up QR posters',
      body: posters
        ? `${plural(posters, 'poster')} ready to print. Put them where people wait or walk by.`
        : 'Make one for each spot people pass: a noticeboard, a library entrance, a shop window.',
      done: posters > 0,
      action: (
        <button onClick={() => navigate('/org/qr')} className={button}>
          <QrCode className="h-4 w-4" /> QR posters
        </button>
      ),
    },
    {
      title: 'Share the map link',
      body: `In your newsletter, on social media, at the next board meeting: ${displayLink(link)}`,
      action: (
        <button
          onClick={() =>
            navigator.clipboard?.writeText(link).then(
              () => toast('Link copied'),
              () => toast(`Copy this link: ${link}`),
            )
          }
          className={button}
        >
          <Copy className="h-4 w-4" /> Copy link
        </button>
      ),
    },
    {
      title: 'See what residents see',
      body: 'The public map, as it looks on a phone.',
      action: (
        <button onClick={() => navigate('/')} className={button}>
          Open the map <ArrowRight className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <section className={card}>
      <div className="border-b border-slate-100 px-4 py-3.5 md:px-5">
        <h2 className="font-semibold">Get the pilot started</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Nothing has been pinned yet. Residents find Problem Pins through your posters and links.
        </p>
      </div>
      <ol>
        {steps.map((s, n) => (
          <li key={s.title} className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 md:px-5">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
            >
              {s.done ? <Check className="h-3.5 w-3.5" /> : n + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.title}</p>
              <p className="text-sm text-slate-500">{s.body}</p>
            </div>
            <div className="text-sm">{s.action}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
