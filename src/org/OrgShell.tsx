import type { ReactNode } from 'react';
import { FileText, Inbox, LayoutGrid, Map as MapIcon, QrCode, Send, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { Logo } from '../components/ui';
import { navigate } from '../router';
import { useStore } from '../store';

export type OrgSection = 'overview' | 'issues' | 'map' | 'reports' | 'sent' | 'qr';

export default function OrgShell({ active, children }: { active: OrgSection; children: ReactNode }) {
  const { issues, district, staff } = useStore();
  const initials = (staff?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const unresolved = issues.filter((i) => i.status !== 'fixed' && i.status !== 'sent_to_city').length;
  const sent = issues.filter((i) => i.status === 'sent_to_city').length;

  const items: { id: OrgSection; label: string; Icon: LucideIcon; to: string; count?: number }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutGrid, to: '/org' },
    { id: 'issues', label: 'Issues', Icon: Inbox, to: '/org/issues', count: unresolved },
    { id: 'map', label: 'Map', Icon: MapIcon, to: '/org/map' },
    { id: 'reports', label: 'Reports', Icon: FileText, to: '/org/reports' },
    { id: 'sent', label: 'Sent to City', Icon: Send, to: '/org/sent', count: sent },
    { id: 'qr', label: 'QR posters', Icon: QrCode, to: '/org/qr' },
  ];

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col bg-sidebar px-4 py-5 text-slate-300 print:hidden">
        <div className="px-1">
          <Logo dark />
        </div>
        <p className="mb-3 mt-3 px-1 font-mono text-[10px] tracking-wider text-slate-500">{district.name.toUpperCase()}</p>
        <nav className="space-y-0.5">
          {items.map(({ id, label, Icon, to, count }) => (
            <button
              key={id}
              onClick={() => navigate(to)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                active === id ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">{label}</span>
              {count !== undefined && <span className="text-xs text-slate-500">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white/5">
            <SlidersHorizontal className="h-4 w-4" /> Settings
          </button>
          <div className="flex items-center gap-3 border-t border-white/10 px-1 pt-3">
            <span className="grid h-7 w-8 place-items-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
              {initials}
            </span>
            <div>
              <p className="text-sm font-medium text-white">{staff?.name ?? 'Not signed in'}</p>
              <p className="text-xs text-slate-500">{staff?.role ?? ''}</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50">{children}</main>
    </div>
  );
}
