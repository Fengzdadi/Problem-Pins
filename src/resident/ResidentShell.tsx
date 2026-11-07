import type { ReactNode } from 'react';
import { QrCode } from 'lucide-react';
import { navigate } from '../router';

export default function ResidentShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full justify-center gap-8 bg-slate-100 sm:py-5">
      <div
        id="resident-scroll"
        className="relative h-full w-full max-w-[430px] overflow-y-auto bg-white sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-xl"
      >
        {children}
      </div>
      <aside className="hidden w-60 shrink-0 self-center text-sm text-slate-500 lg:block">
        <p className="mb-3 font-mono text-[11px] tracking-wider text-slate-400">DEMO SHORTCUTS</p>
        <button
          onClick={() => navigate('/scan/Q-12')}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-ink hover:border-slate-300"
        >
          <QrCode className="h-4 w-4 text-brand" /> Scan the W 16th St noticeboard QR
        </button>
        <p className="mt-4 leading-relaxed">
          Residents see the phone view. Switch to <span className="font-medium text-ink">Organization</span> in the top bar to
          review issues and post updates as West Side District.
        </p>
      </aside>
    </div>
  );
}
