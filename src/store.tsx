import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SAMPLE_ISSUES } from './data/sampleData';
import { DISTRICT, STATUSES } from './data/meta';
import type { Category, Issue, IssueUpdate, Status } from './data/types';
import { DEMO_TODAY } from './lib/format';

const STORAGE_KEY = 'problem-pins-v1';

interface PersistedState {
  issues: Issue[];
  voted: string[];
  following: string[];
  confirmed: Record<string, 'yes' | 'no'>;
  nextId: number;
}

export interface NewIssueDraft {
  title: string;
  description: string;
  category: Category;
  lat: number;
  lng: number;
  locationLabel: string;
  photos: string[];
  via: string;
}

interface Store extends PersistedState {
  lastCreatedId: string | null;
  clearLastCreated: () => void;
  getIssue: (id: string) => Issue | undefined;
  vote: (id: string) => void;
  follow: (id: string) => void;
  addIssue: (draft: NewIssueDraft) => string;
  addComment: (id: string, text: string) => void;
  postUpdate: (id: string, text: string, status?: Status) => void;
  setStatus: (id: string, status: Status) => void;
  assign: (id: string, owner: string | null) => void;
  sendToCity: (id: string) => void;
  nudgeCity: (id: string) => void;
  confirmFix: (id: string, answer: 'yes' | 'no') => void;
  reset: () => void;
  toast: (message: string) => void;
  toastMessage: string | null;
}

function initialState(): PersistedState {
  return { issues: SAMPLE_ISSUES, voted: [], following: [], confirmed: {}, nextId: 2461 };
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch {
    /* fall through to sample data */
  }
  return initialState();
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full (large photos) — keep working in memory */
    }
  }, [state]);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2800);
  }, []);

  const updateIssue = useCallback((id: string, fn: (issue: Issue) => Issue) => {
    setState((s) => ({ ...s, issues: s.issues.map((i) => (i.id === id ? fn(i) : i)) }));
  }, []);

  const store = useMemo<Store>(() => {
    const partnerUpdate = (text: string): IssueUpdate => ({
      id: crypto.randomUUID(),
      author: DISTRICT,
      role: 'partner',
      text,
      date: DEMO_TODAY,
    });

    return {
      ...state,
      lastCreatedId,
      toastMessage,
      toast,
      clearLastCreated: () => setLastCreatedId(null),
      getIssue: (id) => state.issues.find((i) => i.id === id),

      vote: (id) => {
        if (state.voted.includes(id)) return;
        setState((s) => ({
          ...s,
          voted: [...s.voted, id],
          issues: s.issues.map((i) => {
            if (i.id !== id) return i;
            const votes = i.votes + 1;
            const history =
              i.votes < 50 && votes >= 50
                ? [...i.history, { date: DEMO_TODAY, text: `Passed 50 neighbors · flagged to ${DISTRICT}` }]
                : i.history;
            return { ...i, votes, votesThisWeek: i.votesThisWeek + 1, history };
          }),
        }));
      },

      follow: (id) => {
        if (state.following.includes(id)) return;
        setState((s) => ({ ...s, following: [...s.following, id] }));
        updateIssue(id, (i) => ({ ...i, following: i.following + 1 }));
      },

      addIssue: (draft) => {
        const id = `PP-${state.nextId}`;
        const issue: Issue = {
          ...draft,
          id,
          status: 'open',
          votes: 1,
          votesThisWeek: 1,
          createdAt: DEMO_TODAY,
          owner: null,
          updates: [],
          history: [{ date: DEMO_TODAY, text: `Pinned via ${draft.via}` }],
          following: 1,
          duplicatesMerged: 0,
          confirmedFixed: 0,
          isUserReport: true,
        };
        setState((s) => ({
          ...s,
          issues: [issue, ...s.issues],
          voted: [...s.voted, id],
          following: [...s.following, id],
          nextId: s.nextId + 1,
        }));
        setLastCreatedId(id);
        return id;
      },

      addComment: (id, text) =>
        updateIssue(id, (i) => ({
          ...i,
          updates: [...i.updates, { id: crypto.randomUUID(), author: 'You', role: 'resident', text, date: DEMO_TODAY }],
        })),

      postUpdate: (id, text, status) =>
        updateIssue(id, (i) => {
          const changed = status && status !== i.status;
          return {
            ...i,
            status: status ?? i.status,
            fixedOn: status === 'fixed' ? DEMO_TODAY : i.fixedOn,
            updates: [...i.updates, partnerUpdate(text)],
            history: changed
              ? [...i.history, { date: DEMO_TODAY, text: `Status changed to ${STATUSES[status].label}` }]
              : i.history,
          };
        }),

      setStatus: (id, status) =>
        updateIssue(id, (i) => ({
          ...i,
          status,
          fixedOn: status === 'fixed' ? DEMO_TODAY : i.fixedOn,
          history: [
            ...i.history,
            {
              date: DEMO_TODAY,
              text: status === 'fixed' ? `Marked fixed by ${i.owner ?? DISTRICT}` : `Status changed to ${STATUSES[status].label}`,
            },
          ],
        })),

      assign: (id, owner) =>
        updateIssue(id, (i) => ({
          ...i,
          owner,
          status: i.status === 'open' && owner ? 'in_review' : i.status,
          history: [...i.history, { date: DEMO_TODAY, text: owner ? `Assigned to ${owner}` : 'Unassigned' }],
        })),

      sendToCity: (id) =>
        updateIssue(id, (i) => {
          const agency = i.agency ?? 'NYC 311';
          const sr = `311-${21900000 + Math.floor(Math.random() * 99999)}`;
          return {
            ...i,
            status: 'sent_to_city',
            owner: agency,
            cityRequest: { sr, agency, routedTo: agency, sentOn: DEMO_TODAY, sentBy: 'Maya Ruiz' },
            history: [...i.history, { date: DEMO_TODAY, text: `Sent to NYC 311 · SR ${sr}` }],
            updates: [
              ...i.updates,
              partnerUpdate(
                `This is ${agency}'s responsibility, so we filed it with 311 (SR ${sr}) with ${i.votes} neighbors attached. We'll keep following up.`,
              ),
            ],
          };
        }),

      nudgeCity: (id) =>
        updateIssue(id, (i) => ({
          ...i,
          cityRequest: i.cityRequest ? { ...i.cityRequest, lastFollowUp: DEMO_TODAY } : i.cityRequest,
          history: [...i.history, { date: DEMO_TODAY, text: `Followed up with the City, ${i.votes} neighbors attached` }],
        })),

      confirmFix: (id, answer) => {
        setState((s) => ({ ...s, confirmed: { ...s.confirmed, [id]: answer } }));
        updateIssue(id, (i) =>
          answer === 'yes'
            ? { ...i, confirmedFixed: i.confirmedFixed + 1, history: [...i.history, { date: DEMO_TODAY, text: 'A neighbor confirmed the fix' }] }
            : { ...i, history: [...i.history, { date: DEMO_TODAY, text: 'A neighbor says it is still not fixed' }] },
        );
      },

      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState(initialState());
        setLastCreatedId(null);
      },
    };
  }, [state, lastCreatedId, toastMessage, toast, updateIssue]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
