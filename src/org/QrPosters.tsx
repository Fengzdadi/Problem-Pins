import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Printer, QrCode, Trash2 } from 'lucide-react';
import IssueMap from '../components/IssueMap';
import { Poster, PrintPoster, useQrSvg } from '../components/Poster';
import { SampleBadge } from '../components/ui';
import { distanceMeters } from '../data/geo';
import type { AnalyticsEvent, ScanPoint } from '../data/types';
import { downloadText, downloadUrl } from '../lib/csv';
import { formatMeters, nyDate, shortDate } from '../lib/format';
import { displayLink, qrPng, shortLink } from '../lib/qr';
import { isValidCode, loadRetiredCodes, nextFreeCode, normalizeCode, retireCode, usedCodes } from '../lib/scanCodes';
import { useStore } from '../store';

interface Draft {
  code: string;
  name: string;
  detail: string;
  lat: number | null;
  lng: number | null;
  issueId: string;
}

const label = 'mb-1 block font-mono text-[10px] tracking-wider text-slate-500';
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400';

/** Scan points (where posters hang), their QR codes and printable posters. */
export default function QrPosters() {
  const store = useStore();
  const { scanPoints, district } = store;
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [retired, setRetired] = useState(loadRetiredCodes);
  const [selected, setSelected] = useState<string | null>(scanPoints[0]?.code ?? null);
  const [printing, setPrinting] = useState<ScanPoint | null>(null);
  const stopPrinting = useCallback(() => setPrinting(null), []);

  useEffect(() => {
    void store.listEvents().then(setEvents);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const used = useMemo(() => usedCodes(scanPoints, events, retired), [scanPoints, events, retired]);
  const scans = useMemo(() => {
    const byCode = new Map<string, { count: number; last: string | null }>();
    for (const e of events) {
      if (e.name !== 'scan_view' || e.props?.src !== 'qr' || !e.scanCode) continue;
      const s = byCode.get(e.scanCode) ?? { count: 0, last: null };
      s.count += 1;
      s.last = !s.last || e.at > s.last ? e.at : s.last;
      byCode.set(e.scanCode, s);
    }
    return byCode;
  }, [events]);

  const point = selected && selected !== 'new' ? scanPoints.find((p) => p.code === selected) : undefined;

  return (
    <div className="mx-auto max-w-[1160px] px-8 py-7">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-slate-500">QR POSTERS</p>
          <h1 className="text-2xl font-bold">Scan points</h1>
          <p className="text-sm text-slate-600">
            Each poster has its own code, so you can see which spots bring people in. Codes are printed, so they are never reused.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SampleBadge />
          <button
            onClick={() => setSelected('new')}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" /> New scan point
          </button>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_400px]">
        <div className="rounded-xl border border-slate-200 bg-white">
          {scanPoints.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No scan points yet. Add one for each poster you put up.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] text-slate-500">
                  <th className="px-5 py-2 font-normal">CODE</th>
                  <th className="py-2 font-normal">WHERE</th>
                  <th className="py-2 font-normal">LINKED PROBLEM</th>
                  <th className="px-5 py-2 text-right font-normal">QR SCANS</th>
                </tr>
              </thead>
              <tbody>
                {scanPoints.map((p) => {
                  const s = scans.get(p.code);
                  return (
                    <tr
                      key={p.code}
                      onClick={() => setSelected(p.code)}
                      className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selected === p.code ? 'bg-brand-soft/60' : ''}`}
                    >
                      <td className="px-5 py-3 font-mono text-xs">
                        <span className="inline-flex items-center gap-2">
                          <QrCode className="h-4 w-4 text-brand" />
                          {p.code}
                        </span>
                      </td>
                      <td className="py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.detail}</p>
                      </td>
                      <td className="py-3 font-mono text-xs text-slate-500">{p.issueId ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <p className="font-semibold">{s?.count ?? 0}</p>
                        <p className="text-xs text-slate-500">{s?.last ? `last ${shortDate(nyDate(s.last))}` : 'none yet'}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          {selected === 'new' ? (
            <Editor
              key="new"
              used={used}
              onSaved={(code) => setSelected(code)}
              onCancel={() => setSelected(scanPoints[0]?.code ?? null)}
            />
          ) : point ? (
            <>
              <PosterPanel point={point} onPrint={() => setPrinting(point)} />
              <div className="my-5 h-px bg-slate-200" />
              <Editor
                key={point.code}
                point={point}
                used={used}
                printed={scans.has(point.code)}
                onSaved={(code, old) => {
                  if (old && old !== code) {
                    retireCode(old);
                    setRetired(loadRetiredCodes());
                  }
                  setSelected(code);
                }}
                onDeleted={(code) => {
                  retireCode(code);
                  setRetired(loadRetiredCodes());
                  setSelected(scanPoints.find((p) => p.code !== code)?.code ?? null);
                }}
              />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Pick a scan point, or add one for a new poster.</p>
          )}
        </aside>
      </div>

      {printing && <PrintPoster point={printing} district={district} onDone={stopPrinting} />}
    </div>
  );
}

function PosterPanel({ point, onPrint }: { point: ScanPoint; onPrint: () => void }) {
  const { district } = useStore();
  const url = shortLink(point.code);
  const svg = useQrSvg(url);
  const button = 'flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:border-slate-300';

  return (
    <div>
      <p className={label}>POSTER · US LETTER</p>
      <div className="mx-auto w-fit border border-slate-200 shadow-sm">
        <Poster point={point} district={district} scale={0.4} />
      </div>
      <p className="mt-3 text-center font-mono text-xs text-slate-600">
        QR opens <span className="text-ink">{displayLink(url)}</span>
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button
          onClick={onPrint}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Printer className="h-4 w-4" /> Print poster
        </button>
        <button disabled={!svg} onClick={() => svg && downloadText(`problem-pins-${point.code}.svg`, svg, 'image/svg+xml')} className={button}>
          <Download className="h-4 w-4" /> SVG
        </button>
        <button onClick={async () => downloadUrl(`problem-pins-${point.code}.png`, await qrPng(url))} className={button}>
          <Download className="h-4 w-4" /> PNG
        </button>
      </div>
    </div>
  );
}

function Editor({
  point,
  used,
  printed = false,
  onSaved,
  onCancel,
  onDeleted,
}: {
  point?: ScanPoint;
  used: Set<string>;
  /** The code has been scanned, so a poster with it is up somewhere. */
  printed?: boolean;
  onSaved: (code: string, oldCode?: string) => void;
  onCancel?: () => void;
  onDeleted?: (code: string) => void;
}) {
  const store = useStore();
  const { district } = store;
  const [draft, setDraft] = useState<Draft>(() =>
    point
      ? { code: point.code, name: point.name, detail: point.detail, lat: point.lat, lng: point.lng, issueId: point.issueId ?? '' }
      : { code: nextFreeCode(used), name: '', detail: '', lat: null, lng: null, issueId: '' },
  );
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const code = normalizeCode(draft.code);
  const codeChanged = Boolean(point && code !== point.code);
  const codeError = !isValidCode(code)
    ? 'Use letters, numbers and dashes, like Q-14.'
    : code !== point?.code && used.has(code)
      ? `${code} has been used before. Codes are printed, so they are never reused.`
      : null;
  const missing = !draft.name.trim() ? 'Give it a name.' : draft.lat === null ? 'Click the map to place it.' : null;
  const pick = draft.lat !== null && draft.lng !== null ? { lat: draft.lat, lng: draft.lng } : null;
  const mapCenter = useMemo(() => (point ? { lat: point.lat, lng: point.lng } : undefined), [point]);

  const nearby = useMemo(() => {
    const list = store.issues.map((i) => ({ issue: i, d: pick ? distanceMeters(pick, i) : null }));
    return pick ? list.sort((a, b) => a.d! - b.d!) : list.sort((a, b) => b.issue.votes - a.issue.votes);
  }, [store.issues, pick?.lat, pick?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (codeError || missing || !pick) return;
    if (
      codeChanged &&
      !window.confirm(
        `Change ${point!.code} to ${code}?\n\nPosters already printed with ${point!.code} will stop working, and ${point!.code} won't be used again. Reprint the poster after saving.`,
      )
    )
      return;
    setBusy(true);
    const next: ScanPoint = {
      code,
      name: draft.name.trim(),
      detail: draft.detail.trim(),
      lat: pick.lat,
      lng: pick.lng,
      ...(draft.issueId ? { issueId: draft.issueId } : {}),
    };
    let ok = await store.saveScanPoint(next);
    if (ok && codeChanged) ok = await store.deleteScanPoint(point!.code);
    setBusy(false);
    if (!ok) return;
    store.toast(point ? `Saved ${code}` : `Added ${code}`);
    onSaved(code, point?.code);
  };

  const remove = async () => {
    if (!point) return;
    if (
      !window.confirm(
        `Delete ${point.code}, ${point.name}?\n\nAnyone who scans a poster with this code will see “This code isn’t active”. Take the posters down. ${point.code} won't be used again.`,
      )
    )
      return;
    if (await store.deleteScanPoint(point.code)) {
      store.toast(`Deleted ${point.code}`);
      onDeleted?.(point.code);
    }
  };

  return (
    <div>
      <p className={label}>{point ? 'EDIT SCAN POINT' : 'NEW SCAN POINT'}</p>
      <div className="mt-2 grid grid-cols-[110px_1fr] gap-3">
        <div>
          <label className={label} htmlFor="sp-code">
            CODE
          </label>
          <input id="sp-code" className={`${input} font-mono`} value={draft.code} onChange={(e) => set({ code: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="sp-name">
            NAME
          </label>
          <input
            id="sp-name"
            className={input}
            value={draft.name}
            placeholder="BID noticeboard, W 16th St"
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
      </div>
      {codeError && <p className="mt-1.5 text-xs text-brand">{codeError}</p>}
      {!codeError && codeChanged && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {printed ? `${point!.code} has been scanned, so posters with it are up.` : `${point!.code} may already be printed.`} Changing
          the code breaks those posters; {point!.code} will be retired.
        </p>
      )}

      <label className={`${label} mt-3`} htmlFor="sp-detail">
        DETAIL
      </label>
      <input
        id="sp-detail"
        className={input}
        value={draft.detail}
        placeholder="Between 9th and 10th Ave"
        onChange={(e) => set({ detail: e.target.value })}
      />

      <p className={`${label} mt-3`}>LOCATION · CLICK THE MAP</p>
      <div className="h-52 overflow-hidden rounded-lg border border-slate-200">
        <IssueMap issues={[]} center={mapCenter} zoom={district.zoom} pick={pick} onPick={(p) => set({ lat: p.lat, lng: p.lng })} zoomControl />
      </div>

      <label className={`${label} mt-3`} htmlFor="sp-issue">
        LINKED PROBLEM (OPTIONAL)
      </label>
      <select id="sp-issue" className={input} value={draft.issueId} onChange={(e) => set({ issueId: e.target.value })}>
        <option value="">None: the scan page asks what’s wrong</option>
        {draft.issueId && !nearby.some((n) => n.issue.id === draft.issueId) && <option value={draft.issueId}>{draft.issueId}</option>}
        {nearby.map(({ issue, d }) => (
          <option key={issue.id} value={issue.id}>
            {issue.id} · {issue.title}
            {d !== null ? ` · ${formatMeters(d)}` : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-500">Shown first on the scan page so people +1 it instead of pinning it again.</p>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || Boolean(codeError || missing)}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {point ? (codeChanged ? `Save and retire ${point.code}` : 'Save changes') : `Add ${code || 'scan point'}`}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm font-medium text-slate-600">
            Cancel
          </button>
        )}
        {point && (
          <button onClick={remove} className="ml-auto flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {missing && !codeError && <p className="mt-2 text-xs text-slate-500">{missing}</p>}
    </div>
  );
}
