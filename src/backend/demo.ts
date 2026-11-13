import { DEMO_DISTRICT, DEMO_SCAN_POINTS } from '../data/demoDistrict';
import { DEMO_EVENTS } from '../data/demoEvents';
import { STATUSES } from '../data/meta';
import { SAMPLE_ISSUES } from '../data/sampleData';
import type {
  AnalyticsEvent,
  CityRequestInput,
  FollowContact,
  HistoryEvent,
  Issue,
  IssueUpdate,
  MyState,
  ScanPoint,
  StaffUser,
  Status,
} from '../data/types';
import { DEMO_TODAY } from '../lib/format';
import type { Backend, NewIssueDraft, Snapshot } from './types';

/**
 * Sample-data backend for presentations and UI work. Everything lives in this browser's
 * localStorage, the date is frozen at DEMO_TODAY, and every visitor is both a resident
 * and (once "signed in") West Side District staff. Two tabs stay in sync via `storage` events.
 */

export const DEMO_STORAGE_KEY = 'problem-pins-demo-v2';
const MAX_EVENTS = 2000;

export const DEMO_STAFF: StaffUser = {
  id: 'demo-staff',
  name: 'Maya Ruiz',
  email: 'maya@westside.example',
  role: 'Operations manager',
  districtId: DEMO_DISTRICT.id,
};

interface DemoState {
  issues: Issue[];
  scanPoints: ScanPoint[];
  me: MyState;
  /** Contacts left with "Notify me", keyed by issue ID. Never returned by `load`. */
  contacts: Record<string, FollowContact[]>;
  nextId: number;
  events: AnalyticsEvent[];
  staffSignedIn: boolean;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function initialState(): DemoState {
  return {
    issues: structuredClone(SAMPLE_ISSUES),
    scanPoints: structuredClone(DEMO_SCAN_POINTS),
    me: { voted: [], following: [], confirmed: {} },
    contacts: {},
    nextId: 2461,
    events: structuredClone(DEMO_EVENTS),
    staffSignedIn: true,
  };
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  private state: DemoState;
  private authListeners = new Set<(staff: StaffUser | null) => void>();
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.storage = storage;
    this.state = this.read();
  }

  // ---- persistence ----

  private read(): DemoState {
    try {
      const raw = this.storage?.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<DemoState>;
        if (Array.isArray(saved.issues)) return { ...initialState(), ...saved };
      }
    } catch {
      /* corrupted: fall back to the sample data */
    }
    return initialState();
  }

  private save() {
    try {
      this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full (large photos): keep working in memory */
    }
  }

  private mutate(fn: (s: DemoState) => void) {
    fn(this.state);
    this.save();
  }

  private issue(id: string) {
    const issue = this.state.issues.find((i) => i.id === id);
    if (!issue) throw new Error(`Problem ${id} doesn’t exist.`);
    return issue;
  }

  private requireStaff() {
    if (!this.state.staffSignedIn) throw new Error('Sign in as staff to do that.');
    return DEMO_STAFF;
  }

  private log(issue: Issue, text: string) {
    const event: HistoryEvent = { date: DEMO_TODAY, text };
    issue.history.push(event);
  }

  private partnerUpdate(text: string): IssueUpdate {
    return { id: crypto.randomUUID(), author: DEMO_DISTRICT.name, role: 'partner', text, date: DEMO_TODAY };
  }

  // ---- reads ----

  async load(): Promise<Snapshot> {
    const { issues, scanPoints, me, staffSignedIn } = this.state;
    return structuredClone({
      district: DEMO_DISTRICT,
      issues: staffSignedIn ? issues : issues.filter((i) => !i.hidden),
      scanPoints,
      me,
    });
  }

  subscribe(onChange: () => void) {
    if (typeof window === 'undefined') return () => {};
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DEMO_STORAGE_KEY) return;
      this.state = this.read();
      onChange();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }

  // ---- residents ----

  async createIssue(draft: NewIssueDraft) {
    const id = `PP-${this.state.nextId}`;
    const { scanCode: _scanCode, ...fields } = draft;
    const issue: Issue = {
      ...fields,
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
    this.mutate((s) => {
      s.issues.unshift(issue);
      s.me.voted.push(id);
      s.me.following.push(id);
      s.nextId += 1;
    });
    return id;
  }

  async uploadPhoto(photo: Blob) {
    return blobToDataUrl(photo);
  }

  async vote(issueId: string) {
    const issue = this.issue(issueId);
    if (this.state.me.voted.includes(issueId)) return;
    this.mutate((s) => {
      s.me.voted.push(issueId);
      const threshold = DEMO_DISTRICT.rules.reviewVotes;
      if (issue.votes < threshold && issue.votes + 1 >= threshold) {
        this.log(issue, `Passed ${threshold} neighbors · flagged to ${DEMO_DISTRICT.name}`);
      }
      issue.votes += 1;
      issue.votesThisWeek += 1;
    });
  }

  async follow(issueId: string, contact?: FollowContact) {
    const issue = this.issue(issueId);
    this.mutate((s) => {
      if (contact && (contact.email || contact.phone)) (s.contacts[issueId] ??= []).push(contact);
      if (s.me.following.includes(issueId)) return;
      s.me.following.push(issueId);
      issue.following += 1;
    });
  }

  async comment(issueId: string, text: string) {
    const issue = this.issue(issueId);
    this.mutate(() => {
      issue.updates.push({ id: crypto.randomUUID(), author: 'You', role: 'resident', text, date: DEMO_TODAY, mine: true });
    });
  }

  async confirmFix(issueId: string, answer: 'yes' | 'no') {
    const issue = this.issue(issueId);
    if (this.state.me.confirmed[issueId]) return;
    this.mutate((s) => {
      s.me.confirmed[issueId] = answer;
      if (answer === 'yes') {
        issue.confirmedFixed += 1;
        this.log(issue, 'A neighbor confirmed the fix');
      } else {
        this.log(issue, 'A neighbor says it is still not fixed');
      }
    });
  }

  // ---- staff ----

  async postUpdate(issueId: string, text: string, status?: Status) {
    this.requireStaff();
    const issue = this.issue(issueId);
    this.mutate(() => {
      if (status && status !== issue.status) {
        issue.status = status;
        if (status === 'fixed') issue.fixedOn = DEMO_TODAY;
        this.log(issue, `Status changed to ${STATUSES[status].label}`);
      }
      issue.updates.push(this.partnerUpdate(text));
    });
  }

  async setStatus(issueId: string, status: Status) {
    this.requireStaff();
    const issue = this.issue(issueId);
    this.mutate(() => {
      issue.status = status;
      if (status === 'fixed') issue.fixedOn = DEMO_TODAY;
      this.log(
        issue,
        status === 'fixed' ? `Marked fixed by ${issue.owner ?? DEMO_DISTRICT.name}` : `Status changed to ${STATUSES[status].label}`,
      );
    });
  }

  async assign(issueId: string, owner: string | null) {
    this.requireStaff();
    const issue = this.issue(issueId);
    this.mutate(() => {
      issue.owner = owner;
      if (issue.status === 'open' && owner) issue.status = 'in_review';
      this.log(issue, owner ? `Assigned to ${owner}` : 'Unassigned');
    });
  }

  async sendToCity(issueId: string, request?: CityRequestInput) {
    const staff = this.requireStaff();
    const issue = this.issue(issueId);
    const agency = request?.agency || issue.agency || 'NYC 311';
    // Demo only: without a real SR number, make one up so the story still works.
    const sr = request?.sr || `311-${21900000 + Math.floor(Math.random() * 99999)}`;
    this.mutate(() => {
      issue.status = 'sent_to_city';
      issue.owner = agency;
      issue.cityRequest = { sr, agency, routedTo: request?.routedTo || agency, sentOn: DEMO_TODAY, sentBy: staff.name };
      this.log(issue, `Sent to NYC 311 · SR ${sr}`);
      issue.updates.push(
        this.partnerUpdate(
          `This is ${agency}'s responsibility, so we filed it with 311 (SR ${sr}) with ${issue.votes} neighbors attached. We'll keep following up.`,
        ),
      );
    });
  }

  async nudgeCity(issueId: string) {
    this.requireStaff();
    const issue = this.issue(issueId);
    if (!issue.cityRequest) throw new Error(`${issueId} hasn’t been sent to the City yet.`);
    this.mutate(() => {
      issue.cityRequest!.lastFollowUp = DEMO_TODAY;
      this.log(issue, `Followed up with the City, ${issue.votes} neighbors attached`);
    });
  }

  async hideIssue(issueId: string, reason: string) {
    this.requireStaff();
    const issue = this.issue(issueId);
    this.mutate(() => {
      issue.hidden = true;
      issue.hiddenReason = reason;
      this.log(issue, `Hidden by staff: ${reason}`);
    });
  }

  async unhideIssue(issueId: string) {
    this.requireStaff();
    const issue = this.issue(issueId);
    this.mutate(() => {
      issue.hidden = false;
      issue.hiddenReason = undefined;
      this.log(issue, 'Restored by staff');
    });
  }

  async mergeIssue(duplicateId: string, intoId: string) {
    this.requireStaff();
    if (duplicateId === intoId) throw new Error('Pick a different problem to merge into.');
    const dup = this.issue(duplicateId);
    const into = this.issue(intoId);
    if (dup.mergedInto) throw new Error(`${duplicateId} was already merged into ${dup.mergedInto}.`);
    if (into.mergedInto) throw new Error(`${intoId} was itself merged into ${into.mergedInto}.`);
    this.mutate((s) => {
      // The demo only knows this device's own votes, so that is the only overlap it can remove.
      const bothVoted = s.me.voted.includes(dup.id) && s.me.voted.includes(into.id);
      const bothFollowed = s.me.following.includes(dup.id) && s.me.following.includes(into.id);
      into.votes += dup.votes - (bothVoted ? 1 : 0);
      into.votesThisWeek += dup.votesThisWeek;
      into.following += dup.following - (bothFollowed ? 1 : 0);
      into.duplicatesMerged += 1 + dup.duplicatesMerged;
      if (s.me.voted.includes(dup.id) && !bothVoted) s.me.voted.push(into.id);
      if (s.me.following.includes(dup.id) && !bothFollowed) s.me.following.push(into.id);
      dup.mergedInto = into.id;
      this.log(into, `Merged duplicate ${dup.id} · ${dup.votes} neighbors`);
      this.log(dup, `Merged into ${into.id}`);
    });
  }

  async saveScanPoint(point: ScanPoint) {
    this.requireStaff();
    this.mutate((s) => {
      const idx = s.scanPoints.findIndex((p) => p.code === point.code);
      if (idx >= 0) s.scanPoints[idx] = point;
      else s.scanPoints.push(point);
    });
  }

  async deleteScanPoint(code: string) {
    this.requireStaff();
    this.mutate((s) => {
      s.scanPoints = s.scanPoints.filter((p) => p.code !== code);
    });
  }

  async listEvents(since?: string) {
    this.requireStaff();
    return structuredClone(this.state.events.filter((e) => !since || e.at.slice(0, 10) >= since));
  }

  // ---- staff sign-in (any email works in the demo) ----

  async getStaff() {
    return this.state.staffSignedIn ? DEMO_STAFF : null;
  }

  async signIn(email: string, _password: string) {
    if (!email.trim()) throw new Error('Enter your email.');
    this.mutate((s) => {
      s.staffSignedIn = true;
    });
    this.authListeners.forEach((cb) => cb(DEMO_STAFF));
  }

  async signOut() {
    this.mutate((s) => {
      s.staffSignedIn = false;
    });
    this.authListeners.forEach((cb) => cb(null));
  }

  onAuthChange(callback: (staff: StaffUser | null) => void) {
    this.authListeners.add(callback);
    return () => {
      this.authListeners.delete(callback);
    };
  }

  // ---- analytics ----

  track(event: Omit<AnalyticsEvent, 'at'>) {
    try {
      // Keep events on the frozen demo date so date filters line up with the sample data.
      const at = `${DEMO_TODAY}T${new Date().toISOString().slice(11)}`;
      this.mutate((s) => {
        s.events.push({ ...event, at });
        if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
      });
    } catch {
      /* analytics never breaks the app */
    }
  }

  async reset() {
    this.state = initialState();
    this.save();
    this.authListeners.forEach((cb) => cb(DEMO_STAFF));
  }
}
