import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_STORAGE_KEY, DemoBackend, type KeyValueStorage } from './demo';
import type { NewIssueDraft } from './types';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const draft: NewIssueDraft = {
  title: 'Sandwich board blocks the curb cut',
  description: '',
  category: 'accessibility',
  lat: 40.742,
  lng: -74.004,
  locationLabel: 'W 17th St',
  photos: [],
  via: 'Map · problempins.org',
};

let storage: KeyValueStorage;
let backend: DemoBackend;

beforeEach(() => {
  storage = memoryStorage();
  backend = new DemoBackend(storage);
});

const find = async (id: string) => (await backend.load()).issues.find((i) => i.id === id)!;

describe('DemoBackend', () => {
  it('generates sequential IDs and counts the reporter as a vote and a follower', async () => {
    const a = await backend.createIssue(draft);
    const b = await backend.createIssue(draft);
    expect([a, b]).toEqual(['PP-2461', 'PP-2462']);
    const snap = await backend.load();
    const issue = snap.issues.find((i) => i.id === a)!;
    expect(issue).toMatchObject({ votes: 1, following: 1, status: 'open', isUserReport: true });
    expect(snap.me.voted).toContain(a);
    expect(snap.me.following).toContain(a);
  });

  it('counts one vote per device', async () => {
    const before = (await find('PP-2431')).votes;
    await backend.vote('PP-2431');
    await backend.vote('PP-2431');
    expect((await find('PP-2431')).votes).toBe(before + 1);
  });

  it('logs when an issue passes the review threshold', async () => {
    // Put PP-2297 one vote short of the 50-vote rule, then vote from this device.
    await backend.createIssue(draft); // forces a save
    const saved = JSON.parse(storage.getItem(DEMO_STORAGE_KEY)!);
    saved.issues.find((i: { id: string }) => i.id === 'PP-2297').votes = 49;
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
    backend = new DemoBackend(storage);
    await backend.vote('PP-2297');
    const issue = await find('PP-2297');
    expect(issue.votes).toBe(50);
    expect(issue.history.at(-1)?.text).toBe('Passed 50 neighbors · flagged to West Side District');
  });

  it('persists to storage and reloads', async () => {
    const id = await backend.createIssue(draft);
    const again = new DemoBackend(storage);
    expect((await again.load()).issues.some((i) => i.id === id)).toBe(true);
  });

  it('refuses staff actions when signed out', async () => {
    await backend.signOut();
    expect(await backend.getStaff()).toBeNull();
    await expect(backend.postUpdate('PP-2402', 'hello')).rejects.toThrow(/sign in/i);
    await backend.signIn('maya@example.org', 'x');
    await expect(backend.postUpdate('PP-2402', 'hello')).resolves.toBeUndefined();
  });

  it('records a real SR number when staff provide one', async () => {
    await backend.sendToCity('PP-2419', { sr: '311-12345678', agency: 'NYC DOT' });
    const issue = await find('PP-2419');
    expect(issue.status).toBe('sent_to_city');
    expect(issue.cityRequest).toMatchObject({ sr: '311-12345678', agency: 'NYC DOT', sentBy: 'Maya Ruiz' });
  });

  it('merges a duplicate into another issue', async () => {
    const dup = await backend.createIssue(draft);
    const into = await find('PP-2431');
    await backend.mergeIssue(dup, 'PP-2431');
    const snap = await backend.load();
    const merged = snap.issues.find((i) => i.id === dup)!;
    const target = snap.issues.find((i) => i.id === 'PP-2431')!;
    expect(merged.mergedInto).toBe('PP-2431');
    expect(target.votes).toBe(into.votes + 1);
    expect(target.duplicatesMerged).toBe(into.duplicatesMerged + 1);
    expect(snap.me.voted).toContain('PP-2431');
    await expect(backend.mergeIssue('PP-2431', 'PP-2431')).rejects.toThrow();
    await expect(backend.mergeIssue(dup, 'PP-2402')).rejects.toThrow(/already merged/);
  });

  it('hides issues from residents but not from staff', async () => {
    await backend.hideIssue('PP-2440', 'Duplicate of a 311 noise complaint');
    expect((await find('PP-2440')).hidden).toBe(true);
    await backend.signOut();
    expect((await backend.load()).issues.some((i) => i.id === 'PP-2440')).toBe(false);
  });

  it('records analytics events on the demo date', async () => {
    backend.track({ name: 'scan_view', scanCode: 'Q-12' });
    const events = await backend.listEvents('2026-10-14');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'scan_view', scanCode: 'Q-12' });
    expect(events[0].at.startsWith('2026-10-14T')).toBe(true);
  });

  it('keeps follow contacts private', async () => {
    await backend.follow('PP-2402', { email: 'resident@example.org' });
    expect(JSON.stringify(await backend.load())).not.toContain('resident@example.org');
  });

  it('resets to the sample data', async () => {
    const id = await backend.createIssue(draft);
    await backend.reset();
    expect((await backend.load()).issues.some((i) => i.id === id)).toBe(false);
  });
});
