import { execFileSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nyDate } from '../../lib/format';
import type { Backend, NewIssueDraft } from '../types';
import { createSupabaseBackend } from '.';

/**
 * Runs against the local Supabase stack (`supabase start`). Skipped when it isn't running,
 * so `npm test` passes anywhere. Uses two throwaway districts, removed afterwards; the
 * seeded sample district is left alone.
 */

interface Stack {
  url: string;
  anonKey: string;
  serviceKey: string;
}

async function localStack(): Promise<Stack | null> {
  if (process.env.SKIP_SUPABASE_TESTS) return null;
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const env = Object.fromEntries(
      out
        .split('\n')
        .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );
    if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return null;
    const health = await fetch(`${env.API_URL}/auth/v1/health`, { headers: { apikey: env.ANON_KEY } });
    return health.ok ? { url: env.API_URL, anonKey: env.ANON_KEY, serviceKey: env.SERVICE_ROLE_KEY } : null;
  } catch {
    return null;
  }
}

const stack = await localStack();
const run = Math.random().toString(36).slice(2, 8);
const A = `test-a-${run}`;
const B = `test-b-${run}`;

// A 0.01° square around Union Square.
const square = (lat: number, lng: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
});
const INSIDE = { lat: 40.735, lng: -73.995 };

const draft = (title: string, extra: Partial<NewIssueDraft> = {}): NewIssueDraft => ({
  title,
  description: 'Test issue',
  category: 'lighting',
  ...INSIDE,
  locationLabel: 'Union Sq',
  photos: [],
  via: 'Map · test',
  ...extra,
});

describe.skipIf(!stack)('Supabase backend (local stack)', { timeout: 20000 }, () => {
  const { url, anonKey, serviceKey } = stack ?? { url: '', anonKey: '', serviceKey: '' };
  const backend = (districtId = A) => createSupabaseBackend({ supabaseUrl: url, supabaseAnonKey: anonKey, districtId });
  let admin: SupabaseClient;
  const staffIds: string[] = [];
  const password = `pw-${run}-${Math.random().toString(36).slice(2)}`;

  // Two residents (separate devices) and staff for A and for B.
  let alice: Backend;
  let bob: Backend;
  let staffA: Backend;
  let staffB: Backend;

  async function makeStaff(district: string, name: string) {
    const email = `${name.toLowerCase()}-${run}@test.example`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    staffIds.push(data.user.id);
    const insert = await admin.from('staff').insert({ user_id: data.user.id, district_id: district, name, role: 'Tester' });
    if (insert.error) throw insert.error;
    const b = backend(district);
    await b.signIn(email, password);
    return b;
  }

  const find = async (b: Backend, id: string) => (await b.load()).issues.find((i) => i.id === id);

  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const districts = [A, B].map((id) => ({
      id,
      name: id === A ? 'Test District A' : 'Test District B',
      area: 'Union Square',
      center_lat: 40.735,
      center_lng: -73.995,
      zoom: 16,
      boundary: square(40.73, -74.0),
      categories: ['lighting', 'litter', 'other'],
      teams: ['Crew'],
      rules: { reviewVotes: 2, reviewDays: 30, forwardVotes: 25, cityNoReplyDays: 10 },
    }));
    const { error } = await admin.from('districts').insert(districts);
    if (error) throw error;
    alice = backend();
    bob = backend();
    staffA = await makeStaff(A, 'Avery');
    staffB = await makeStaff(B, 'Blake');
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('events').delete().in('district_id', [A, B]);
    await admin.from('scan_points').delete().in('district_id', [A, B]);
    await admin.from('issues').update({ merged_into: null }).in('district_id', [A, B]);
    await admin.from('issues').delete().in('district_id', [A, B]);
    await admin.from('districts').delete().in('id', [A, B]);
    for (const id of staffIds) await admin.auth.admin.deleteUser(id);
  });

  let pinned: string;

  it('creates an issue with a server ID, one vote and one follow from the reporter', async () => {
    pinned = await alice.createIssue(draft('Street light out'));
    expect(pinned).toMatch(/^PP-\d+$/);
    expect(Number(pinned.slice(3))).toBeGreaterThanOrEqual(2461);

    const snap = await alice.load();
    const issue = snap.issues.find((i) => i.id === pinned)!;
    expect(snap.district).toMatchObject({ id: A, name: 'Test District A', categories: ['lighting', 'litter', 'other'] });
    expect(issue).toMatchObject({ votes: 1, votesThisWeek: 1, following: 1, status: 'open', isUserReport: true, createdAt: nyDate() });
    expect(issue.history.map((h) => h.text)).toEqual(['Pinned via Map · test']);
    expect(snap.me.voted).toContain(pinned);
    expect(snap.me.following).toContain(pinned);
  });

  it('refuses pins outside the district boundary and bad input', async () => {
    await expect(alice.createIssue(draft('Far away', { lat: 40.8, lng: -73.95 }))).rejects.toThrow(/outside/);
    await expect(alice.createIssue(draft('x'))).rejects.toThrow('Give the problem a short title.');
    await expect(alice.createIssue(draft('Noise', { category: 'noise' }))).rejects.toThrow('Pick a category.');
    await expect(alice.createIssue(draft('Photo', { photos: ['https://evil.example/pixel.gif'] }))).rejects.toThrow(/uploaded/);
  });

  it('counts one vote per device and logs the review threshold once', async () => {
    const other = (await bob.load()).issues.find((i) => i.id === pinned)!;
    expect(other.isUserReport).toBeUndefined();

    await bob.vote(pinned);
    await bob.vote(pinned);
    await alice.vote(pinned);
    const issue = (await find(bob, pinned))!;
    expect(issue.votes).toBe(2);
    expect(issue.history.filter((h) => h.text.startsWith('Passed 2 neighbors'))).toHaveLength(1);
  });

  it('shows resident notes as "Neighbor", and as "You" to their author', async () => {
    await bob.comment(pinned, '  Still dark tonight.  ');
    const forBob = (await find(bob, pinned))!.updates.at(-1)!;
    const forAlice = (await find(alice, pinned))!.updates.at(-1)!;
    expect(forBob).toMatchObject({ author: 'You', role: 'resident', text: 'Still dark tonight.', mine: true });
    expect(forAlice).toMatchObject({ author: 'Neighbor', role: 'resident' });
    expect(forAlice.mine).toBeUndefined();
    await expect(bob.comment(pinned, '   ')).rejects.toThrow('Write something first.');
  });

  it('keeps follow contacts private', async () => {
    await bob.follow(pinned, { email: 'bob@example.com' });
    await bob.follow(pinned, { phone: '(212) 555-0100' });
    expect((await find(alice, pinned))!.following).toBe(2);
    await expect(bob.follow(pinned, { email: 'not-an-email' })).rejects.toThrow(/email/);

    const resident = createClient(url, anonKey, { auth: { persistSession: false } });
    await resident.auth.signInAnonymously();
    const read = await resident.from('follow_contacts').select('*');
    expect(read.error?.message).toMatch(/permission denied/);

    const { data } = await admin.from('follow_contacts').select('email, phone').eq('issue_id', pinned);
    expect(data).toEqual([{ email: 'bob@example.com', phone: '2125550100' }]);
  });

  it('records one fix confirmation per device', async () => {
    await bob.confirmFix(pinned, 'yes');
    await bob.confirmFix(pinned, 'no');
    const snap = await bob.load();
    expect(snap.me.confirmed[pinned]).toBe('yes');
    expect(snap.issues.find((i) => i.id === pinned)!.confirmedFixed).toBe(1);
  });

  it('gives residents no direct table access beyond their own records', async () => {
    const resident = createClient(url, anonKey, { auth: { persistSession: false } });
    await resident.auth.signInAnonymously();
    expect((await resident.from('issues').select('id').eq('district_id', A)).data).toEqual([]);
    expect((await resident.from('votes').insert({ issue_id: pinned, user_id: crypto.randomUUID() })).error).toBeTruthy();
    expect((await resident.from('issues').update({ status: 'fixed' }).eq('id', pinned)).error).toBeTruthy();
    expect((await resident.from('staff').insert({ user_id: crypto.randomUUID(), district_id: A, name: 'x' })).error).toBeTruthy();
    expect((await resident.from('events').select('*')).data).toEqual([]);
  });

  it('rejects staff actions from residents', async () => {
    await expect(alice.hideIssue(pinned, 'spam')).rejects.toThrow('Sign in as staff to do that.');
    await expect(alice.postUpdate(pinned, 'Fixed it')).rejects.toThrow('Sign in as staff to do that.');
    await expect(alice.sendToCity(pinned, { sr: '311-1', agency: 'NYC DOT' })).rejects.toThrow('Sign in as staff to do that.');
    await expect(alice.mergeIssue(pinned, pinned)).rejects.toThrow();
    await expect(alice.listEvents()).rejects.toThrow('Sign in as staff to do that.');
    await expect(alice.saveScanPoint({ code: 'Q-1', name: 'x', detail: '', ...INSIDE })).rejects.toThrow('Sign in as staff');
    expect(await alice.getStaff()).toBeNull();
  });

  it('signs staff in and resolves their staff row', async () => {
    expect(await staffA.getStaff()).toMatchObject({ name: 'Avery', role: 'Tester', districtId: A });
    const outsider = backend(B);
    await expect(outsider.signIn(`avery-${run}@test.example`, password)).rejects.toThrow(/isn’t set up as staff/);
    await expect(outsider.signIn(`avery-${run}@test.example`, 'wrong-password')).rejects.toThrow('Wrong email or password.');
    expect(await outsider.getStaff()).toBeNull();
  });

  it('keeps staff of one district out of another', async () => {
    await expect(staffB.postUpdate(pinned, 'Not mine')).rejects.toThrow('Sign in as staff to do that.');
    await expect(staffB.hideIssue(pinned, 'x')).rejects.toThrow('Sign in as staff to do that.');
    const asB = backend(A);
    await asB.signIn(`blake-${run}@test.example`, password).catch(() => {});
    await expect(asB.listEvents()).rejects.toThrow();
  });

  it('assigns, posts updates and marks fixed', async () => {
    await staffA.assign(pinned, 'Crew');
    let issue = (await find(staffA, pinned))!;
    expect(issue).toMatchObject({ owner: 'Crew', status: 'in_review' });
    expect(issue.history.at(-1)!.text).toBe('Assigned to Crew');

    await staffA.postUpdate(pinned, 'Crew is on it.', 'fixed');
    issue = (await find(alice, pinned))!;
    expect(issue).toMatchObject({ status: 'fixed', fixedOn: nyDate() });
    expect(issue.updates.at(-1)).toMatchObject({ author: 'Test District A', role: 'partner', text: 'Crew is on it.' });
    expect(issue.history.at(-1)!.text).toBe('Status changed to Fixed');

    await staffA.setStatus(pinned, 'open');
    expect((await find(alice, pinned))!.fixedOn).toBeUndefined();
  });

  it('sends to the City only with an SR number, then nudges', async () => {
    await expect(staffA.sendToCity(pinned)).rejects.toThrow('Enter the 311 service request number.');
    await staffA.sendToCity(pinned, { sr: '311-22001234', agency: 'NYC DOT', routedTo: 'NYC DOT · Street Lighting' });
    let issue = (await find(alice, pinned))!;
    expect(issue).toMatchObject({ status: 'sent_to_city', owner: 'NYC DOT' });
    expect(issue.cityRequest).toEqual({
      sr: '311-22001234',
      agency: 'NYC DOT',
      routedTo: 'NYC DOT · Street Lighting',
      sentOn: nyDate(),
      sentBy: 'Avery',
    });
    expect(issue.updates.at(-1)!.text).toContain('SR 311-22001234) with 2 neighbors attached');

    await staffA.nudgeCity(pinned);
    issue = (await find(alice, pinned))!;
    expect(issue.cityRequest!.lastFollowUp).toBe(nyDate());
    expect(issue.history.at(-1)!.text).toBe('Followed up with the City, 2 neighbors attached');
  });

  it('hides issues from residents but not from staff', async () => {
    const id = await bob.createIssue(draft('Spam'));
    await staffA.hideIssue(id, 'Not a public-space problem');
    expect(await find(alice, id)).toBeUndefined();
    expect(await find(bob, id)).toBeUndefined();
    await expect(alice.vote(id)).rejects.toThrow(`Problem ${id} doesn’t exist.`);
    expect(await find(staffA, id)).toMatchObject({ hidden: true, hiddenReason: 'Not a public-space problem' });
    expect(await find(staffB, id)).toBeUndefined();

    await staffA.unhideIssue(id);
    expect(await find(alice, id)).toBeDefined();
  });

  it('merges a duplicate, counting a device on both once', async () => {
    const into = await alice.createIssue(draft('Bins overflowing', { category: 'litter' }));
    const dup = await bob.createIssue(draft('Trash everywhere', { category: 'litter' }));
    await alice.vote(dup);
    await staffA.mergeIssue(dup, into);

    const snap = await bob.load();
    const target = snap.issues.find((i) => i.id === into)!;
    const merged = snap.issues.find((i) => i.id === dup)!;
    expect(target).toMatchObject({ votes: 2, following: 2, duplicatesMerged: 1 });
    expect(target.history.at(-1)!.text).toBe(`Merged duplicate ${dup} · 2 neighbors`);
    expect(merged).toMatchObject({ mergedInto: into, votes: 0 });
    expect(snap.me.voted).toContain(into);

    await expect(staffA.mergeIssue(dup, into)).rejects.toThrow(`${dup} was already merged into ${into}.`);
    await expect(bob.vote(dup)).rejects.toThrow(/merged into/);
  });

  it('saves scan points and never reuses a retired code', async () => {
    await staffA.saveScanPoint({ code: 'q-7', name: 'Noticeboard', detail: 'By the gate', ...INSIDE, issueId: pinned });
    expect((await alice.load()).scanPoints).toEqual([{ code: 'Q-7', name: 'Noticeboard', detail: 'By the gate', ...INSIDE, issueId: pinned }]);
    await staffA.deleteScanPoint('Q-7');
    expect((await alice.load()).scanPoints).toEqual([]);
    await expect(staffA.saveScanPoint({ code: 'Q-7', name: 'Again', detail: '', ...INSIDE })).rejects.toThrow(/earlier poster/);
  });

  it('records analytics events and lists them for staff only', async () => {
    alice.track({ name: 'issue_view', issueId: pinned, props: { source: 'test' } });
    let events: Awaited<ReturnType<Backend['listEvents']>> = [];
    for (let i = 0; i < 20 && !events.length; i++) {
      await new Promise((r) => setTimeout(r, 100));
      events = await staffA.listEvents(nyDate());
    }
    expect(events).toEqual([{ name: 'issue_view', issueId: pinned, props: { source: 'test' }, at: expect.any(String) }]);
    expect(await staffB.listEvents()).toEqual([]);
    expect(await staffA.listEvents('2999-01-01')).toEqual([]);
  });

  it('uploads photos as public images and refuses other files', async () => {
    // 1x1 transparent PNG
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) =>
      c.charCodeAt(0),
    );
    const photoUrl = await alice.uploadPhoto(new Blob([png], { type: 'image/png' }));
    expect(photoUrl).toMatch(/\/storage\/v1\/object\/public\/photos\/.+\.png$/);
    expect((await fetch(photoUrl)).status).toBe(200);

    const id = await alice.createIssue(draft('With a photo', { photos: [photoUrl] }));
    expect((await find(bob, id))!.photos).toEqual([photoUrl]);

    await expect(alice.uploadPhoto(new Blob(['hello'], { type: 'text/plain' }))).rejects.toThrow(/Only photos/);
  });

  it('pings other devices over Realtime when something changes', async () => {
    let unsubscribe = () => {};
    const pinged = new Promise<void>((resolve) => {
      unsubscribe = bob.subscribe(resolve);
    });
    await new Promise((r) => setTimeout(r, 1500)); // let the channel join
    await alice.createIssue(draft('Realtime check'));
    await pinged;
    unsubscribe();
  });

  it('restores the resident identity when staff sign out', async () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
      removeItem: (key: string) => void saved.delete(key),
    };
    const device = createSupabaseBackend({ supabaseUrl: url, supabaseAnonKey: anonKey, districtId: A }, { storage });
    const id = await device.createIssue(draft('Before sign-in'));
    await device.signIn(`avery-${run}@test.example`, password);
    expect((await device.load()).me.voted).not.toContain(id);
    await device.signOut();
    expect(await device.getStaff()).toBeNull();
    expect((await device.load()).me.voted).toContain(id);
  });
});
