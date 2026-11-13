import { Send } from 'lucide-react';
import type { AttentionRules, Issue } from '../data/types';
import { daysBetween } from '../lib/format';
import { useStore } from '../store';

export type Attention = 'nudge' | 'assign' | 'forward';

export function attentionRule(rules: AttentionRules) {
  return `Rule: flag anything with ${rules.reviewVotes}+ votes or ${rules.reviewDays}+ days and no owner, City-owned problems not yet sent, and City requests with no reply in ${rules.cityNoReplyDays}+ days`;
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
    return `City-owned · sent to 311 · no reply in ${daysBetween(since)} days · ${issue.votes} votes`;
  }
  if (issue.agency) return `+${issue.votesThisWeek} votes this week · ${issue.agency} handles this, not the District`;
  return `Open ${days} days · no owner · ${issue.votes} votes`;
}

export function ActionButton({ issue, kind, size = 'md' }: { issue: Issue; kind: Attention; size?: 'sm' | 'md' }) {
  const { nudgeCity, assign, sendToCity, toast, district } = useStore();
  const team = district.teams[0];
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  if (kind === 'nudge')
    return (
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (await nudgeCity(issue.id)) toast(`Followed up on ${issue.cityRequest?.sr} with ${issue.votes} votes attached`);
        }}
        className={`flex items-center gap-1.5 rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark ${pad}`}
      >
        <Send className="h-3.5 w-3.5" /> Nudge City
      </button>
    );
  if (kind === 'forward')
    return (
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (await sendToCity(issue.id)) toast(`Logged a 311 request for ${issue.id}`);
        }}
        className={`flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white font-semibold hover:border-slate-300 ${pad}`}
      >
        <Send className="h-3.5 w-3.5" /> Forward to City
      </button>
    );
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (await assign(issue.id, team)) toast(`${issue.id} assigned to ${team}`);
      }}
      className={`rounded-lg bg-brand font-semibold text-white hover:bg-brand-dark ${pad}`}
    >
      Assign
    </button>
  );
}
