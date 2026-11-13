import { useState } from 'react';
import { Send } from 'lucide-react';
import type { AttentionRules, Issue } from '../data/types';
import { daysBetween } from '../lib/format';
import { useStore } from '../store';
import { ForwardToCityDialog } from './ForwardToCity';

export type Attention = 'nudge' | 'assign' | 'forward';

export function attentionRule(rules: AttentionRules) {
  return `Rule: flag anything with ${rules.reviewVotes}+ votes or ${rules.reviewDays}+ days and no owner, City-owned problems with ${rules.forwardVotes}+ votes not yet sent to 311, and City requests with ${rules.reviewVotes}+ votes and no follow-up in ${rules.cityNoReplyDays}+ days`;
}

export function attentionFor(issue: Issue, rules: AttentionRules): Attention | null {
  if (issue.status === 'fixed') return null;
  if (issue.status === 'sent_to_city' && issue.cityRequest) {
    const since = issue.cityRequest.lastFollowUp ?? issue.cityRequest.sentOn;
    return issue.votes >= rules.reviewVotes && daysBetween(since) >= rules.cityNoReplyDays ? 'nudge' : null;
  }
  if (issue.agency && !issue.cityRequest && issue.votes >= rules.forwardVotes) return 'forward';
  if (!issue.owner && (issue.votes >= rules.reviewVotes || daysBetween(issue.createdAt) >= rules.reviewDays)) return 'assign';
  return null;
}

export function attentionReason(issue: Issue) {
  const days = daysBetween(issue.createdAt);
  const req = issue.cityRequest;
  if (req) {
    const since = req.lastFollowUp ?? req.sentOn;
    return `City-owned · sent to 311 · no follow-up in ${daysBetween(since)} days · ${issue.votes} votes`;
  }
  if (issue.agency) return `+${issue.votesThisWeek} votes this week · ${issue.agency} handles this, not the District`;
  return `Open ${days} days · no owner · ${issue.votes} votes`;
}

export function ActionButton({ issue, kind, size = 'md' }: { issue: Issue; kind: Attention; size?: 'sm' | 'md' }) {
  const { nudgeCity, assign, toast, district } = useStore();
  const [forwarding, setForwarding] = useState(false);
  const team = district.teams[0];
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  if (kind === 'nudge')
    return (
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (await nudgeCity(issue.id)) toast(`Follow-up on ${issue.cityRequest?.sr} recorded`);
        }}
        title="Record that you followed up with the City"
        className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark ${pad}`}
      >
        <Send className="h-3.5 w-3.5" /> Log follow-up
      </button>
    );
  if (kind === 'forward')
    return (
      <>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setForwarding(true);
          }}
          className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white font-semibold hover:border-slate-300 ${pad}`}
        >
          <Send className="h-3.5 w-3.5" /> Forward to City
        </button>
        {forwarding && <ForwardToCityDialog issue={issue} onClose={() => setForwarding(false)} />}
      </>
    );
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (await assign(issue.id, team)) toast(`${issue.id} assigned to ${team}`);
      }}
      title={`Assign to ${team}`}
      className={`shrink-0 rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark ${pad}`}
    >
      Assign
    </button>
  );
}
