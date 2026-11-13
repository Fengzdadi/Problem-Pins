import { QrCode } from 'lucide-react';
import { useStore } from '../store';

/** QR codes and printable posters for scan points. Placeholder; the QR + analytics module owns it. */
export default function QrPosters() {
  const { scanPoints } = useStore();
  return (
    <div className="mx-auto max-w-[1060px] px-8 py-7">
      <p className="font-mono text-[11px] tracking-wider text-slate-500">QR POSTERS</p>
      <h1 className="text-2xl font-bold">Scan points</h1>
      <ul className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {scanPoints.map((p) => (
          <li key={p.code} className="flex items-center gap-3 px-5 py-3">
            <QrCode className="h-4 w-4 text-brand" />
            <span className="font-mono text-xs text-slate-500">{p.code}</span>
            <span className="font-medium">{p.name}</span>
            <span className="text-sm text-slate-500">{p.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
