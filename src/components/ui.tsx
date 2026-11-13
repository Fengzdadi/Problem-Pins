import { Accessibility, Armchair, CircleHelp, Lightbulb, Trash2, Volume2, type LucideIcon } from 'lucide-react';
import markUrl from '../../brand/mark.svg';
import { isDemo } from '../config';
import { CATEGORIES, STATUSES } from '../data/meta';
import type { Category, Issue, Status } from '../data/types';
import { useStore } from '../store';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  lighting: Lightbulb,
  seating: Armchair,
  accessibility: Accessibility,
  litter: Trash2,
  noise: Volume2,
  other: CircleHelp,
};

export function Logo({ dark = false, size = 'md' }: { dark?: boolean; size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={markUrl} alt="" className={size === 'sm' ? 'h-6' : 'h-7'} />
      <span className={`font-semibold ${dark ? 'text-white' : 'text-ink'}`}>Problem Pins</span>
    </div>
  );
}

export function CategoryTag({ category, className = '' }: { category: Category; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORIES[category].color }} />
      {CATEGORIES[category].label}
    </span>
  );
}

export function StatusTag({ status, resident = false, className = '' }: { status: Status; resident?: boolean; className?: string }) {
  const meta = STATUSES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
      {resident ? meta.residentLabel : meta.label}
    </span>
  );
}

/** Marks screens that show sample data. Renders nothing in live mode. */
export function SampleBadge() {
  if (!isDemo) return null;
  return (
    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[10px] tracking-wider text-amber-700">
      SAMPLE DATA
    </span>
  );
}

export function PhotoThumb({ issue, className = '', index = 0 }: { issue: Issue; className?: string; index?: number }) {
  const photo = issue.photos[index];
  if (photo) return <img src={photo} alt="" className={`object-cover ${className}`} />;
  const Icon = CATEGORY_ICONS[issue.category];
  const color = CATEGORIES[issue.category].color;
  return (
    <div
      className={`grid place-items-center ${className}`}
      style={{ background: `linear-gradient(135deg, #1d2333 0%, ${color}66 140%)` }}
      aria-label={`${CATEGORIES[issue.category].label} placeholder photo`}
    >
      <Icon className="h-1/3 w-1/3 max-h-12 max-w-12 text-white/70" strokeWidth={1.5} />
    </div>
  );
}

export function Toast() {
  const { toastMessage } = useStore();
  if (!toastMessage) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2000] flex justify-center px-4 print:hidden">
      <div className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">{toastMessage}</div>
    </div>
  );
}
