import { labelClass } from '../components/ui';
import { CATEGORIES } from '../data/meta';
import { useStore } from '../store';
import { TODO_GROUPS } from './dashboard';
import Dialog from './Dialog';

/** District settings, read-only. For the pilot they are set up by the Problem Pins team, not edited here. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { district, mode } = useStore();
  const { rules } = district;
  const section = 'border-t border-slate-100 py-3 first:border-t-0 first:pt-0';
  const heading = `${labelClass} mb-1.5`;

  return (
    <Dialog title="District settings" label={district.name} onClose={onClose}>
      <div className="text-sm">
        <div className={section}>
          <p className={heading}>District</p>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium">{district.name}</dd>
            <dt className="text-slate-500">Area</dt>
            <dd>{district.area}</dd>
            <dt className="text-slate-500">Office email</dt>
            <dd>{district.contactEmail ?? <span className="text-slate-500">Not set</span>}</dd>
            <dt className="text-slate-500">Boundary</dt>
            <dd>{district.boundary ? 'Pins outside it are refused' : 'None, pins are accepted anywhere'}</dd>
            <dt className="text-slate-500">Data</dt>
            <dd>{mode === 'demo' ? 'Sample data in this browser' : 'Live, shared with your team'}</dd>
          </dl>
        </div>
        <div className={section}>
          <p className={heading}>Who issues can be assigned to</p>
          <p>{district.teams.join(', ')}</p>
        </div>
        <div className={section}>
          <p className={heading}>Categories residents can pick</p>
          <p>{district.categories.map((c) => CATEGORIES[c].label).join(', ')}</p>
        </div>
        <div className={section}>
          <p className={heading}>What goes on the to-do list</p>
          <ul className="space-y-1.5">
            {TODO_GROUPS.map((g) => (
              <li key={g.kind}>
                <p className="font-medium">{g.title}</p>
                <p className="text-slate-500">{g.rule(rules)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-slate-500">
            In each group the longest wait comes first. How many neighbors +1’d only breaks ties; it never puts an issue on the list.
          </p>
        </div>
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          These are set up with the Problem Pins team during the pilot. To change one, ask them; there’s no editor here yet.
        </p>
      </div>
    </Dialog>
  );
}
