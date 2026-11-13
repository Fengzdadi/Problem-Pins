import type { DataMode } from '../config';
import type {
  AnalyticsEvent,
  Category,
  CityRequestInput,
  District,
  FollowContact,
  Issue,
  MyState,
  ScanPoint,
  StaffUser,
  Status,
} from '../data/types';

/**
 * The contract between the UI (via `src/store.tsx`) and a data backend.
 *
 * Two implementations: `demo.ts` (sample data in localStorage, frozen date) and
 * `supabase/` (shared Postgres, real dates). The UI never talks to a backend directly;
 * it goes through the store, which reloads the snapshot after every mutation.
 *
 * Rules every implementation follows:
 * - Mutations resolve when the change is saved and reject with an `Error` whose message
 *   is safe to show to the user. The store catches and toasts it.
 * - Counts (`votes`, `votesThisWeek`, `following`, ...) are derived from records, never set.
 * - The backend, not the browser, generates issue IDs (`PP-2461`) and timestamps.
 * - Staff methods fail unless a staff user is signed in (live mode).
 */
export interface Backend {
  readonly mode: DataMode;

  /** Everything the app shows. Called on start, after every mutation and on change pings. */
  load(): Promise<Snapshot>;
  /** Calls `onChange` when data changed elsewhere (another device, staff). Returns unsubscribe. */
  subscribe(onChange: () => void): () => void;

  // ---- Residents (no account; one identity per device) ----
  /** Creates the issue with one vote and one follow from this device. Resolves to the new ID. */
  createIssue(draft: NewIssueDraft): Promise<string>;
  /** Stores an already-resized photo (EXIF stripped by the canvas). Resolves to a URL for `<img src>`. */
  uploadPhoto(photo: Blob): Promise<string>;
  /** Idempotent: one vote per device per issue. */
  vote(issueId: string): Promise<void>;
  follow(issueId: string, contact?: FollowContact): Promise<void>;
  comment(issueId: string, text: string): Promise<void>;
  confirmFix(issueId: string, answer: 'yes' | 'no'): Promise<void>;

  // ---- Staff ----
  postUpdate(issueId: string, text: string, status?: Status): Promise<void>;
  setStatus(issueId: string, status: Status): Promise<void>;
  assign(issueId: string, owner: string | null): Promise<void>;
  /** Records a 311 request staff filed. `request` is required in live mode (the real SR number). */
  sendToCity(issueId: string, request?: CityRequestInput): Promise<void>;
  nudgeCity(issueId: string): Promise<void>;
  hideIssue(issueId: string, reason: string): Promise<void>;
  unhideIssue(issueId: string): Promise<void>;
  /** Moves votes and follows from the duplicate onto `intoId` and hides the duplicate. */
  mergeIssue(duplicateId: string, intoId: string): Promise<void>;
  /** Creates or updates by `code`. */
  saveScanPoint(point: ScanPoint): Promise<void>;
  deleteScanPoint(code: string): Promise<void>;
  /** Analytics events since a `YYYY-MM-DD` date (inclusive), oldest first. Staff only. */
  listEvents(since?: string): Promise<AnalyticsEvent[]>;

  // ---- Staff sign-in ----
  getStaff(): Promise<StaffUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(callback: (staff: StaffUser | null) => void): () => void;

  // ---- Analytics: fire and forget, never throws ----
  track(event: Omit<AnalyticsEvent, 'at'>): void;

  /** Demo only: restore the sample data. */
  reset?(): Promise<void>;
}

export interface Snapshot {
  district: District;
  /** Everything this viewer may see. For staff this includes hidden and merged issues. */
  issues: Issue[];
  scanPoints: ScanPoint[];
  me: MyState;
}

export interface NewIssueDraft {
  title: string;
  description: string;
  category: Category;
  lat: number;
  lng: number;
  locationLabel: string;
  locationDetail?: string;
  /** URLs returned by `uploadPhoto`. */
  photos: string[];
  /** Human-readable source, e.g. "QR · BID noticeboard, W 16th St Q-12" or "Map · problempins.org". */
  via: string;
  /** Set when the pin started from a QR scan. */
  scanCode?: string;
}
