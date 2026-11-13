import { useEffect } from 'react';
import { Check, ChevronUp } from 'lucide-react';
import { Logo, PhotoThumb, StatusTag } from '../components/ui';
import { CATEGORIES } from '../data/meta';
import { daysBetween } from '../lib/format';
import { navigate } from '../router';
import { useStore } from '../store';

/** Where a printed QR code lands. `source` is "qr" when the visit came through the short link. */
export default function ScanLanding({ code, source }: { code: string; source: string | null }) {
  const store = useStore();
  const { district, track } = store;
  const point = store.scanPoints.find((p) => p.code === code);
  const linked = point?.issueId ? store.getIssue(point.issueId) : undefined;
  // Follow a merge so the poster keeps working after staff dedupe the problem.
  const issue = linked?.mergedInto ? store.getIssue(linked.mergedInto) : linked;
  const voted = issue ? store.voted.includes(issue.id) : false;
  const known = Boolean(point);

  useEffect(() => {
    track({ name: 'scan_view', scanCode: code, props: { src: source ?? 'link', known } });
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!point) {
    return (
      <div className="px-5 pb-8 pt-8">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold">This code isn’t active</h1>
        <p className="mt-2 text-slate-600">
          The poster you scanned (<span className="font-mono">{code || 'no code'}</span>) isn’t linked to a spot anymore. You can still pin a
          problem on the {district.area} map.
        </p>
        <button onClick={() => navigate('/')} className="mt-5 font-semibold text-brand">
          Open the map →
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 pt-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <span className="text-sm text-slate-500">with {district.name}</span>
      </div>

      <p className="font-mono text-[11px] tracking-wider text-slate-500">YOU SCANNED</p>
      <h1 className="mt-1 text-2xl font-bold">{point.name}</h1>
      <p className="text-slate-600">{point.detail}</p>

      {issue && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <p className="font-mono text-[11px] tracking-wider text-slate-500">ALREADY REPORTED HERE</p>
          <div className="mt-2 flex gap-3">
            <div className="flex-1">
              <p className="text-lg font-semibold leading-snug">{issue.title}</p>
              <p className="mt-2 text-sm text-slate-500">
                <StatusTag status={issue.status} resident className="text-ink" /> · {issue.votes} neighbors ·{' '}
                {daysBetween(issue.createdAt)} days
              </p>
            </div>
            <PhotoThumb issue={issue} className="h-14 w-14 shrink-0 rounded-lg" />
          </div>
          {voted ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border-2 border-brand bg-brand-soft py-3 font-semibold text-brand">
              <Check className="h-5 w-5" /> You +1’d this · {issue.votes} neighbors
            </div>
          ) : (
            <button
              onClick={() => store.vote(issue.id, 'scan')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-dark"
            >
              <ChevronUp className="h-5 w-5" strokeWidth={2.5} /> +1 This is my problem too
            </button>
          )}
          <button onClick={() => navigate(`/i/${issue.id}`)} className="mt-3 w-full text-center font-semibold text-brand">
            See what’s happening with it
          </button>
        </div>
      )}

      <div className="my-5 flex items-center gap-3 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-200" /> or report something else here <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {district.categories.map((c) => (
          <button
            key={c}
            onClick={() => navigate(`/new?cat=${c}&from=${code}`)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium hover:border-slate-300"
          >
            <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[c].color }} />
            {CATEGORIES[c].label}
          </button>
        ))}
      </div>

      <p className="mt-5 text-sm text-slate-500">No app or account. Leave a phone number or email only if you want updates.</p>
      <button onClick={() => navigate('/')} className="mt-4 text-sm font-semibold text-brand">
        Explore the neighborhood map →
      </button>
    </div>
  );
}
