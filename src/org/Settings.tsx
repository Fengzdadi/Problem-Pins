import { CATEGORIES } from '../data/meta';
import { useStore } from '../store';
import Dialog from './Dialog';

/** District settings, read-only. For the pilot they are set up by the Problem Pins team, not edited here. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { district, mode } = useStore();
  const { rules } = district;
  const section = 'border-t border-slate-100 py-3 first:border-t-0 first:pt-0';
  const heading = 'mb-1.5 font-mono text-[10px] tracking-wider text-slate-500';

  return (
    <Dialog title="District settings" label={district.name.toUpperCase()} onClose={onClose}>
      <div className="text-sm">
        <div className={section}>
          <p className={heading}>DISTRICT</p>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{district.name}</dd>
            <dt className="text-slate-500">Area</dt>
            <dd>{district.area}</dd>
            <dt className="text-slate-500">Contact</dt>
            <dd>{district.contactEmail ?? <span className="text-slate-400">Not set</span>}</dd>
            <dt className="text-slate-500">Boundary</dt>
            <dd>{district.boundary ? 'Pins outside it are refused' : 'None, pins are accepted anywhere'}</dd>
            <dt className="text-slate-500">Data</dt>
            <dd>{mode === 'demo' ? 'Sample data in this browser' : 'Live, shared with your team'}</dd>
          </dl>
        </div>
        <div className={section}>
          <p className={heading}>TEAMS WORK CAN BE ASSIGNED TO</p>
          <ul className="flex flex-wrap gap-1.5">
            {district.teams.map((t) => (
              <li key={t} className="rounded-md bg-slate-100 px-2 py-1">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className={section}>
          <p className={heading}>CATEGORIES RESIDENTS CAN PICK</p>
          <p>{district.categories.map((c) => CATEGORIES[c].label).join(', ')}</p>
        </div>
        <div className={section}>
          <p className={heading}>WHEN AN ISSUE NEEDS ATTENTION</p>
          <ul className="list-disc space-y-1 pl-4 text-slate-700">
            <li>
              No owner and {rules.reviewVotes}+ votes, or open {rules.reviewDays}+ days
            </li>
            <li>City-owned with {rules.forwardVotes}+ votes and not yet sent to 311</li>
            <li>
              Sent to 311, {rules.reviewVotes}+ votes and no follow-up in {rules.cityNoReplyDays}+ days
            </li>
          </ul>
        </div>
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          These are set up with the Problem Pins team during the pilot. To change one, ask them; there’s no editor here yet.
        </p>
      </div>
    </Dialog>
  );
}
