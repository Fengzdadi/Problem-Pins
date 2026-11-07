import { RotateCcw } from 'lucide-react';
import { navigate, useRoute } from './router';
import { useStore } from './store';
import { Toast } from './components/ui';
import ResidentShell from './resident/ResidentShell';
import MapHome from './resident/MapHome';
import IssueDetail from './resident/IssueDetail';
import NewPin from './resident/NewPin';
import ScanLanding from './resident/ScanLanding';
import Updates from './resident/Updates';
import OrgShell, { type OrgSection } from './org/OrgShell';
import Overview from './org/Overview';
import Issues from './org/Issues';
import OrgMap from './org/OrgMap';
import Reports from './org/Reports';

function DemoBar({ org }: { org: boolean }) {
  const { reset, toast } = useStore();
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition ${active ? 'bg-white text-ink shadow-sm' : 'text-slate-300 hover:text-white'}`;
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 bg-[#0b1020] px-4 text-xs text-slate-300 print:hidden">
      <span className="hidden sm:inline">
        <span className="font-semibold text-white">Problem Pins</span> · clickable prototype · sample data, West Chelsea
      </span>
      <div className="flex rounded-lg bg-white/10 p-0.5">
        <button className={tab(!org)} onClick={() => navigate('/')}>
          Resident
        </button>
        <button className={tab(org)} onClick={() => navigate('/org')}>
          Organization
        </button>
      </div>
      <button
        className="flex items-center gap-1.5 text-slate-400 hover:text-white"
        onClick={() => {
          reset();
          toast('Demo data reset');
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset demo
      </button>
    </div>
  );
}

export default function App() {
  const { path, query } = useRoute();
  const seg = path.split('/').filter(Boolean);
  const isOrg = seg[0] === 'org';

  let content;
  if (isOrg) {
    const section = (seg[1] ?? 'overview') as OrgSection;
    let page;
    switch (section) {
      case 'issues':
        page = <Issues selectedId={seg[2]} tab={query.get('tab') ?? 'inbox'} />;
        break;
      case 'sent':
        page = <Issues selectedId={seg[2]} tab="city" />;
        break;
      case 'map':
        page = <OrgMap />;
        break;
      case 'reports':
        page = <Reports />;
        break;
      default:
        page = <Overview />;
    }
    content = <OrgShell active={section === 'sent' || query.get('tab') === 'city' ? 'sent' : section}>{page}</OrgShell>;
  } else {
    let page;
    switch (seg[0]) {
      case 'i':
        page = <IssueDetail id={seg[1]} />;
        break;
      case 'new':
        page = <NewPin category={query.get('cat')} from={query.get('from')} />;
        break;
      case 'scan':
        page = <ScanLanding code={seg[1] ?? 'Q-12'} />;
        break;
      case 'updates':
        page = <Updates />;
        break;
      default:
        page = <MapHome />;
    }
    content = <ResidentShell>{page}</ResidentShell>;
  }

  return (
    <div className="flex h-full flex-col">
      <DemoBar org={isOrg} />
      <div className="min-h-0 flex-1">{content}</div>
      <Toast />
    </div>
  );
}
