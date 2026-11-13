import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createBackend, type Backend, type NewIssueDraft, type Snapshot } from './backend';
import type { DataMode } from './config';
import type {
  AnalyticsEvent,
  CityRequestInput,
  District,
  FollowContact,
  Issue,
  ScanPoint,
  StaffUser,
  Status,
} from './data/types';

/**
 * The one place screens get data and actions from. It holds the latest backend snapshot,
 * reloads it after every mutation (and when the backend pings a change), and turns errors
 * into toasts. Actions resolve to `true` on success and never throw.
 */
interface Store {
  mode: DataMode;
  district: District;
  /** Public issues: not hidden, not merged. What residents see. */
  issues: Issue[];
  /** Staff only: hidden or merged issues. */
  hiddenIssues: Issue[];
  scanPoints: ScanPoint[];
  voted: string[];
  following: string[];
  confirmed: Record<string, 'yes' | 'no'>;
  staff: StaffUser | null;
  lastCreatedId: string | null;
  clearLastCreated: () => void;
  /** Finds any issue this viewer can see, including merged ones (for redirects). */
  getIssue: (id: string) => Issue | undefined;
  refresh: () => Promise<void>;

  // residents
  vote: (id: string, source?: string) => Promise<boolean>;
  follow: (id: string, contact?: FollowContact) => Promise<boolean>;
  /** Uploads the photos, creates the issue and resolves to its new ID (null on failure). */
  addIssue: (draft: Omit<NewIssueDraft, 'photos'>, photos?: Blob[]) => Promise<string | null>;
  addComment: (id: string, text: string) => Promise<boolean>;
  confirmFix: (id: string, answer: 'yes' | 'no') => Promise<boolean>;

  // staff
  postUpdate: (id: string, text: string, status?: Status) => Promise<boolean>;
  setStatus: (id: string, status: Status) => Promise<boolean>;
  assign: (id: string, owner: string | null) => Promise<boolean>;
  sendToCity: (id: string, request?: CityRequestInput) => Promise<boolean>;
  nudgeCity: (id: string) => Promise<boolean>;
  hideIssue: (id: string, reason: string) => Promise<boolean>;
  unhideIssue: (id: string) => Promise<boolean>;
  mergeIssue: (duplicateId: string, intoId: string) => Promise<boolean>;
  saveScanPoint: (point: ScanPoint) => Promise<boolean>;
  deleteScanPoint: (code: string) => Promise<boolean>;
  listEvents: (since?: string) => Promise<AnalyticsEvent[]>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<boolean>;

  track: (event: Omit<AnalyticsEvent, 'at'>) => void;
  /** Demo only. */
  reset: () => Promise<boolean>;
  toast: (message: string) => void;
  toastMessage: string | null;
}

const StoreContext = createContext<Store | null>(null);

function message(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const loadSeq = useRef(0);
  const refreshTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string) => {
    setToastMessage(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2800);
  }, []);

  const reload = useCallback(async (b: Backend) => {
    const seq = ++loadSeq.current;
    const next = await b.load();
    if (seq === loadSeq.current) setSnapshot(next); // ignore out-of-order responses
  }, []);

  // Start: pick the backend, load data and the staff session, listen for changes.
  useEffect(() => {
    let cancelled = false;
    let cleanups: (() => void)[] = [];
    (async () => {
      try {
        const b = await createBackend();
        if (cancelled) return;
        const [, signedIn] = await Promise.all([reload(b), b.getStaff()]);
        if (cancelled) return;
        setStaff(signedIn);
        setBackend(b);
        cleanups = [
          b.subscribe(() => {
            window.clearTimeout(refreshTimer.current);
            refreshTimer.current = window.setTimeout(() => void reload(b).catch(() => {}), 250);
          }),
          b.onAuthChange((s) => {
            setStaff(s);
            void reload(b).catch(() => {});
          }),
        ];
      } catch (error) {
        if (!cancelled) setLoadError(message(error));
      }
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [reload]);

  const store = useMemo<Store | null>(() => {
    if (!backend || !snapshot) return null;
    const b = backend;

    /** Runs a mutation, reloads, and reports failure as a toast. */
    const run = async (fn: () => Promise<unknown>, event?: Omit<AnalyticsEvent, 'at'>) => {
      try {
        await fn();
        if (event) b.track(event);
        await reload(b);
        return true;
      } catch (error) {
        toast(message(error));
        await reload(b).catch(() => {});
        return false;
      }
    };

    /** Optimistic local change for snappy +1/follow; the reload after the mutation corrects it. */
    const patch = (id: string, fn: (s: Snapshot) => Snapshot) =>
      setSnapshot((s) => (s && s.issues.some((i) => i.id === id) ? fn(s) : s));

    const visible = snapshot.issues.filter((i) => !i.hidden && !i.mergedInto);

    return {
      mode: b.mode,
      district: snapshot.district,
      issues: visible,
      hiddenIssues: snapshot.issues.filter((i) => i.hidden || i.mergedInto),
      scanPoints: snapshot.scanPoints,
      voted: snapshot.me.voted,
      following: snapshot.me.following,
      confirmed: snapshot.me.confirmed,
      staff,
      lastCreatedId,
      toastMessage,
      toast,
      clearLastCreated: () => setLastCreatedId(null),
      getIssue: (id) => snapshot.issues.find((i) => i.id === id),
      refresh: () => reload(b),

      vote: (id, source) => {
        if (snapshot.me.voted.includes(id)) return Promise.resolve(true);
        patch(id, (s) => ({
          ...s,
          me: { ...s.me, voted: [...s.me.voted, id] },
          issues: s.issues.map((i) => (i.id === id ? { ...i, votes: i.votes + 1, votesThisWeek: i.votesThisWeek + 1 } : i)),
        }));
        return run(() => b.vote(id), { name: 'vote', issueId: id, props: source ? { source } : undefined });
      },

      follow: (id, contact) => {
        const already = snapshot.me.following.includes(id);
        if (!already) {
          patch(id, (s) => ({
            ...s,
            me: { ...s.me, following: [...s.me.following, id] },
            issues: s.issues.map((i) => (i.id === id ? { ...i, following: i.following + 1 } : i)),
          }));
        }
        return run(() => b.follow(id, contact), {
          name: 'follow',
          issueId: id,
          props: { contact: contact?.email ? 'email' : contact?.phone ? 'phone' : 'none' },
        });
      },

      addIssue: async (draft, photos = []) => {
        try {
          const urls = await Promise.all(photos.map((p) => b.uploadPhoto(p)));
          const id = await b.createIssue({ ...draft, photos: urls });
          b.track({ name: 'pin_submit', issueId: id, scanCode: draft.scanCode, props: { category: draft.category, photos: photos.length } });
          setLastCreatedId(id);
          await reload(b);
          return id;
        } catch (error) {
          toast(message(error));
          return null;
        }
      },

      addComment: (id, text) => run(() => b.comment(id, text), { name: 'comment', issueId: id }),
      confirmFix: (id, answer) => run(() => b.confirmFix(id, answer), { name: 'confirm_fix', issueId: id, props: { answer } }),

      postUpdate: (id, text, status) =>
        run(() => b.postUpdate(id, text, status), { name: 'staff_update', issueId: id, props: status ? { status } : undefined }),
      setStatus: (id, status) => run(() => b.setStatus(id, status), { name: 'staff_status', issueId: id, props: { status } }),
      assign: (id, owner) => run(() => b.assign(id, owner), { name: 'staff_assign', issueId: id, props: { assigned: Boolean(owner) } }),
      sendToCity: (id, request) => run(() => b.sendToCity(id, request), { name: 'staff_send_to_city', issueId: id }),
      nudgeCity: (id) => run(() => b.nudgeCity(id), { name: 'staff_nudge', issueId: id }),
      hideIssue: (id, reason) => run(() => b.hideIssue(id, reason), { name: 'staff_hide', issueId: id }),
      unhideIssue: (id) => run(() => b.unhideIssue(id)),
      mergeIssue: (duplicateId, intoId) =>
        run(() => b.mergeIssue(duplicateId, intoId), { name: 'staff_merge', issueId: intoId, props: { duplicate: duplicateId } }),
      saveScanPoint: (point) => run(() => b.saveScanPoint(point)),
      deleteScanPoint: (code) => run(() => b.deleteScanPoint(code)),
      listEvents: async (since) => {
        try {
          return await b.listEvents(since);
        } catch (error) {
          toast(message(error));
          return [];
        }
      },
      signIn: (email, password) => run(() => b.signIn(email, password)),
      signOut: () => run(() => b.signOut()),

      track: (event) => b.track(event),
      reset: () =>
        run(async () => {
          await b.reset?.();
          setLastCreatedId(null);
        }),
    };
  }, [backend, snapshot, staff, lastCreatedId, toastMessage, toast, reload]);

  if (loadError) return <StartupScreen error={loadError} />;
  if (!store) return <StartupScreen />;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function StartupScreen({ error }: { error?: string }) {
  return (
    <div className="grid h-full place-items-center bg-slate-100 p-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <p className="font-semibold">Problem Pins couldn’t load.</p>
          <p className="mt-1 text-sm text-slate-600">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 font-semibold text-brand">
            Try again
          </button>
        </div>
      ) : (
        <p className="font-mono text-xs tracking-wider text-slate-400" role="status">
          LOADING…
        </p>
      )}
    </div>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
