import { createClient, type Session, type SupportedStorage } from '@supabase/supabase-js';
import type { config as appConfig } from '../../config';
import type { AnalyticsEvent, CityRequestInput, FollowContact, ScanPoint, StaffUser, Status } from '../../data/types';
import type { Backend, NewIssueDraft, Snapshot } from '../types';
import { mapEvent, mapSnapshot, toError, toUploadError, type EventRow, type SnapshotRow } from './map';

/**
 * Live backend on Supabase (Postgres + Auth + Storage + Realtime). The database side lives in
 * supabase/migrations; docs/BACKEND.md explains the setup.
 *
 * Residents are anonymous Supabase users, one per device, created on first load. Staff sign in
 * with email and password; signing out restores the device's resident identity, so its votes
 * stay one per device.
 */

export type SupabaseConfig = Pick<typeof appConfig, 'supabaseUrl' | 'supabaseAnonKey' | 'districtId'>;

export interface SupabaseBackendOptions {
  /** Where the auth session is kept. Defaults to localStorage in browsers, memory elsewhere. */
  storage?: SupportedStorage;
}

const PHOTO_BUCKET = 'photos';
const EVENTS_PAGE = 1000;
// The device's anonymous session, set aside while staff are signed in on it.
const RESIDENT_SESSION_KEY = 'problem-pins-resident-refresh';
const CONNECT_ERROR = 'Couldn’t connect this device. Reload the page and try again.';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function createSupabaseBackend(config: SupabaseConfig, options: SupabaseBackendOptions = {}): Backend {
  const districtId = config.districtId;
  if (!districtId) {
    throw new Error('This deployment has no district set. Add VITE_DISTRICT_ID to the environment.');
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: options.storage },
  });

  const keep = options.storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  const remember = async (key: string, value: string | null) => {
    try {
      if (value === null) await keep?.removeItem(key);
      else await keep?.setItem(key, value);
    } catch {
      /* storage unavailable: the device gets a new identity next time */
    }
  };
  const recall = async (key: string) => {
    try {
      return (await keep?.getItem(key)) ?? null;
    } catch {
      return null;
    }
  };

  // ---- sessions ----

  let sessionReady: Promise<Session> | null = null;

  /** Every device needs a session to write. Residents get an anonymous one on first use. */
  function ensureSession(): Promise<Session> {
    sessionReady ??= (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;
      const signedIn = await supabase.auth.signInAnonymously();
      if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('No session');
      return signedIn.data.session;
    })().catch((error) => {
      sessionReady = null;
      throw error;
    });
    return sessionReady;
  }

  async function requireSession() {
    try {
      return await ensureSession();
    } catch (error) {
      console.error('Problem Pins sign-in failed', error);
      throw new Error(CONNECT_ERROR);
    }
  }

  /** After staff sign out, go back to this device's resident identity (or a new one). */
  async function restoreResident() {
    sessionReady = null;
    const refreshToken = await recall(RESIDENT_SESSION_KEY);
    await remember(RESIDENT_SESSION_KEY, null);
    if (refreshToken) {
      const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!error) return;
    }
    await ensureSession().catch(() => {});
  }

  async function staffFor(session: Session | null): Promise<StaffUser | null> {
    const user = session?.user;
    if (!user || user.is_anonymous) return null;
    const { data, error } = await supabase
      .from('staff')
      .select('name, role')
      .eq('user_id', user.id)
      .eq('district_id', districtId)
      .maybeSingle();
    if (error || !data) return null;
    return { id: user.id, name: data.name, email: user.email ?? '', role: data.role, districtId };
  }

  async function call<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
    await requireSession();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw toError(error);
    return data as T;
  }

  const onIssue = (fn: string) => (issueId: string) => call(fn, { p_issue: issueId });

  return {
    mode: 'live',

    async load(): Promise<Snapshot> {
      // Reading works without a session (e.g. if anonymous sign-in is rate limited).
      await ensureSession().catch((error) => console.warn('Problem Pins: reading without a session', error));
      const { data, error } = await supabase.rpc('get_snapshot', { p_district: districtId });
      if (error) throw toError(error);
      return mapSnapshot(data as SnapshotRow);
    },

    subscribe(onChange) {
      let subscribedBefore = false;
      const channel = supabase
        .channel(`district:${districtId}`)
        .on('broadcast', { event: 'change' }, () => onChange())
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          // Reconnected after a drop (phone asleep, network change): catch up on what we missed.
          if (subscribedBefore) onChange();
          subscribedBefore = true;
        });
      return () => {
        void supabase.removeChannel(channel);
      };
    },

    // ---- residents ----

    async createIssue(draft: NewIssueDraft) {
      return call<string>('create_issue', {
        p_district: districtId,
        p_title: draft.title,
        p_category: draft.category,
        p_lat: draft.lat,
        p_lng: draft.lng,
        p_location_label: draft.locationLabel,
        p_via: draft.via,
        p_description: draft.description,
        p_location_detail: draft.locationDetail ?? null,
        p_photos: draft.photos,
        p_scan_code: draft.scanCode ?? null,
      });
    },

    async uploadPhoto(photo: Blob) {
      const session = await requireSession();
      const type = photo.type || 'image/jpeg';
      const path = `${session.user.id}/${crypto.randomUUID()}.${EXTENSIONS[type] ?? 'jpg'}`;
      const bucket = supabase.storage.from(PHOTO_BUCKET);
      const { error } = await bucket.upload(path, photo, { contentType: type, cacheControl: '31536000', upsert: false });
      if (error) throw toUploadError(error);
      return bucket.getPublicUrl(path).data.publicUrl;
    },

    vote: onIssue('vote'),

    async follow(issueId: string, contact?: FollowContact) {
      await call('follow', { p_issue: issueId, p_email: contact?.email || null, p_phone: contact?.phone || null });
    },

    async comment(issueId: string, text: string) {
      await call('comment', { p_issue: issueId, p_text: text });
    },

    async confirmFix(issueId: string, answer: 'yes' | 'no') {
      await call('confirm_fix', { p_issue: issueId, p_answer: answer });
    },

    // ---- staff (the database checks the caller is staff of the issue's district) ----

    async postUpdate(issueId: string, text: string, status?: Status) {
      await call('post_update', { p_issue: issueId, p_text: text, p_status: status ?? null });
    },

    async setStatus(issueId: string, status: Status) {
      await call('set_status', { p_issue: issueId, p_status: status });
    },

    async assign(issueId: string, owner: string | null) {
      await call('assign', { p_issue: issueId, p_owner: owner });
    },

    async sendToCity(issueId: string, request?: CityRequestInput) {
      if (!request?.sr?.trim()) throw new Error('Enter the 311 service request number.');
      await call('send_to_city', {
        p_issue: issueId,
        p_sr: request.sr,
        p_agency: request.agency || null,
        p_routed_to: request.routedTo || null,
      });
    },

    nudgeCity: onIssue('nudge_city'),

    async hideIssue(issueId: string, reason: string) {
      await call('hide_issue', { p_issue: issueId, p_reason: reason });
    },

    unhideIssue: onIssue('unhide_issue'),

    async mergeIssue(duplicateId: string, intoId: string) {
      await call('merge_issue', { p_duplicate: duplicateId, p_into: intoId });
    },

    async saveScanPoint(point: ScanPoint) {
      await call('save_scan_point', {
        p_district: districtId,
        p_code: point.code,
        p_name: point.name,
        p_lat: point.lat,
        p_lng: point.lng,
        p_detail: point.detail,
        p_issue_id: point.issueId ?? null,
      });
    },

    async deleteScanPoint(code: string) {
      await call('delete_scan_point', { p_district: districtId, p_code: code });
    },

    async listEvents(since?: string) {
      const events: AnalyticsEvent[] = [];
      let after = 0;
      for (;;) {
        const page = await call<EventRow[]>('list_events', { p_district: districtId, p_since: since ?? null, p_after_id: after });
        events.push(...page.map(mapEvent));
        if (page.length < EVENTS_PAGE) return events;
        after = page[page.length - 1].id;
      }
    },

    // ---- staff sign-in ----

    async getStaff() {
      try {
        const { data } = await supabase.auth.getSession();
        return await staffFor(data.session);
      } catch {
        return null;
      }
    },

    async signIn(email: string, password: string) {
      const address = email.trim();
      if (!address) throw new Error('Enter your email.');
      if (!password) throw new Error('Enter your password.');

      const { data: before } = await supabase.auth.getSession();
      const residentToken = before.session?.user.is_anonymous ? before.session.refresh_token : null;

      const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
      if (error) {
        if (error.code === 'invalid_credentials') throw new Error('Wrong email or password.');
        if (error.status === 429) throw new Error('Too many attempts. Wait a few minutes and try again.');
        throw toError(error);
      }
      if (residentToken) await remember(RESIDENT_SESSION_KEY, residentToken);
      sessionReady = Promise.resolve(data.session);

      if (!(await staffFor(data.session))) {
        await supabase.auth.signOut({ scope: 'local' });
        await restoreResident();
        throw new Error('This account isn’t set up as staff for this district.');
      }
    },

    async signOut() {
      await supabase.auth.signOut({ scope: 'local' });
      await restoreResident();
    },

    onAuthChange(callback: (staff: StaffUser | null) => void) {
      let lastUserId: string | null | undefined;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        const userId = session?.user.id ?? null;
        const first = lastUserId === undefined;
        if (userId === lastUserId) return;
        lastUserId = userId;
        if (first && event === 'INITIAL_SESSION') return; // the store already asked getStaff()
        // Supabase calls this while holding its auth lock; query after it is released.
        setTimeout(() => {
          void staffFor(session).then(callback, () => callback(null));
        }, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    // ---- analytics: fire and forget ----

    track(event: Omit<AnalyticsEvent, 'at'>) {
      void ensureSession()
        .then(() =>
          supabase.from('events').insert({
            district_id: districtId,
            name: event.name,
            issue_id: event.issueId ?? null,
            scan_code: event.scanCode ?? null,
            props: event.props ?? null,
          }),
        )
        .catch(() => {
          /* analytics never breaks the app */
        });
    },
  };
}
