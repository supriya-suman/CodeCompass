import { describe, expect, it } from 'vitest';
import { CompassDB } from '../lib/db';
import { SyncEngine, type RemoteDoc, type RemoteStore } from '../lib/sync/engine';
import { installTracking, TombstoneStore } from '../lib/sync/tracking';
import type { Question } from '../lib/types';

/**
 * In-memory stand-in for Firestore. It keeps one record space per uid and,
 * like the real security rules, refuses any access where the signed-in uid
 * differs from the uid in the path.
 */
class FakeServer {
  spaces = new Map<string, Map<string, RemoteDoc>>();
  listeners: { uid: string; since: number; cb: (d: RemoteDoc[]) => void }[] = [];
  clock = 1000;
  space(uid: string) {
    if (!this.spaces.has(uid)) this.spaces.set(uid, new Map());
    return this.spaces.get(uid)!;
  }
  remote(authUid: string, pathUid = authUid): RemoteStore & { online: boolean } {
    const server = this;
    const r = {
      online: true,
      async push(docs: RemoteDoc[]) {
        if (!r.online) throw new Error('offline');
        if (authUid !== pathUid) throw new Error('permission-denied');
        const ms = ++server.clock;
        const stored = docs.map((d) => ({ ...d, serverMs: ms }));
        for (const d of stored) server.space(pathUid).set(`${d.table}__${d.id}`, d);
        for (const l of server.listeners) if (l.uid === pathUid) l.cb(stored);
      },
      subscribe(since: number, cb: (d: RemoteDoc[]) => void) {
        if (authUid !== pathUid) throw new Error('permission-denied');
        cb([...server.space(pathUid).values()].filter((d) => (d.serverMs ?? 0) >= since));
        const l = { uid: pathUid, since, cb };
        server.listeners.push(l);
        return () => void (server.listeners = server.listeners.filter((x) => x !== l));
      }
    };
    return r;
  }
}

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 27, 10, 0, 0, ++tick)).toISOString();

function device(server: FakeServer, uid: string, storage = new MemStorage()) {
  const db = new CompassDB(`t-${uid}-${Math.random()}`);
  const tombs = new TombstoneStore(`tomb.${uid}`, storage);
  const remote = server.remote(uid);
  const engine = new SyncEngine(db, remote, tombs, () => remote.online);
  installTracking(db, tombs, () => undefined, clock);
  return { db, tombs, remote, engine };
}

const q = (id: string, title: string): Question => ({
  id, title, createdAt: '', updatedAt: '', url: '', platform: 'LeetCode', topic: 'Arrays', subtopic: '', difficulty: 'Easy', status: 'Solved',
  attemptedOn: null, solvedOn: '2026-10-27', timeSpentMin: 0, approach: '', notes: '', code: '', timeComplexity: '', spaceComplexity: '',
  mistakes: '', nextRevisionOn: null, revisionStage: 0, companyTags: [], sheet: ''
});
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('change tracking', () => {
  it('marks creates, updates, put-over-existing and bulk writes dirty, and queues deletes incl. clear()', async () => {
    const server = new FakeServer();
    const { db, tombs } = device(server, 'u1');
    await db.questions.add(q('a', 'A'));
    expect((await db.questions.get('a'))!._dirty).toBe(1);
    await db.questions.update('a', { _dirty: 0 } as never);
    // a normal update re-dirties
    await db.questions.update('a', { title: 'A2' });
    expect((await db.questions.get('a'))!._dirty).toBe(1);
    await db.questions.bulkPut([q('b', 'B'), q('c', 'C')]);
    expect((await db.questions.get('c'))!._dirty).toBe(1);
    await db.questions.delete('b');
    expect(tombs.list().map((t) => t.id)).toEqual(['b']);
    await db.questions.clear();
    expect(tombs.list().map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
    // re-creating a deleted id removes its pending tombstone
    await db.questions.add(q('a', 'again'));
    expect(tombs.list().map((t) => t.id).sort()).toEqual(['b', 'c']);
  });
});

describe('sync between devices of one account', () => {
  it('uploads, downloads to a second device, propagates edits and deletes', async () => {
    const server = new FakeServer();
    const phone = device(server, 'sujata');
    const laptop = device(server, 'sujata');
    await phone.engine.start();
    await laptop.engine.start();

    await phone.db.questions.add(q('q1', 'Two Sum'));
    await phone.engine.pushNow();
    await settle();
    expect((await laptop.db.questions.get('q1'))?.title).toBe('Two Sum');
    expect((await phone.db.questions.get('q1'))!._dirty).toBe(0);
    expect(await phone.engine.countPending()).toBe(0);

    await laptop.db.questions.update('q1', { title: 'Two Sum (revised)' });
    await laptop.engine.pushNow();
    await settle();
    expect((await phone.db.questions.get('q1'))?.title).toBe('Two Sum (revised)');

    await phone.db.questions.delete('q1');
    await phone.engine.pushNow();
    await settle();
    expect(await laptop.db.questions.get('q1')).toBeUndefined();
    expect(phone.tombs.list()).toHaveLength(0);
  });

  it('a new device downloads everything on first sign-in', async () => {
    const server = new FakeServer();
    const a = device(server, 'u');
    await a.engine.start();
    await a.db.questions.bulkAdd([q('1', 'x'), q('2', 'y')]);
    await a.db.settings.put({ id: 'settings', timezone: 'Asia/Kolkata' } as never);
    await a.engine.pushNow();
    const b = device(server, 'u');
    await b.engine.start();
    await settle();
    expect(await b.db.questions.count()).toBe(2);
    expect((await b.db.settings.get('settings'))?.timezone).toBe('Asia/Kolkata');
  });

  it('keeps offline edits and uploads them when back online', async () => {
    const server = new FakeServer();
    const a = device(server, 'u');
    const b = device(server, 'u');
    await a.engine.start();
    await b.engine.start();
    a.remote.online = false;
    await a.db.questions.add(q('off', 'Offline work'));
    await a.engine.pushNow();
    expect(a.engine.getStatus().state).toBe('offline');
    expect(await a.engine.countPending()).toBe(1);
    expect(await b.db.questions.get('off')).toBeUndefined();
    a.remote.online = true;
    await a.engine.pushNow();
    await settle();
    expect((await b.db.questions.get('off'))?.title).toBe('Offline work');
  });

  it('resolves concurrent edits by last write wins without losing the newer one', async () => {
    const server = new FakeServer();
    const a = device(server, 'u');
    const b = device(server, 'u');
    await a.engine.start();
    await b.engine.start();
    await a.db.questions.add(q('c', 'v0'));
    await a.engine.pushNow();
    await settle();
    b.remote.online = false;
    await a.db.questions.update('c', { title: 'older edit on A' });
    await b.db.questions.update('c', { title: 'newer edit on B' }); // later clock
    await a.engine.pushNow();
    await settle();
    // B's unsynced newer edit is not overwritten by A's older one
    expect((await b.db.questions.get('c'))?.title).toBe('newer edit on B');
    b.remote.online = true;
    await b.engine.pushNow();
    await settle();
    expect((await a.db.questions.get('c'))?.title).toBe('newer edit on B');
  });
});

describe('isolation between accounts on the same computer', () => {
  it('two people never see or merge each other’s records', async () => {
    const server = new FakeServer();
    const shared = new MemStorage(); // same browser, same localStorage
    const sujata = device(server, 'uid-sujata', shared);
    const supriya = device(server, 'uid-supriya', shared);
    await sujata.engine.start();
    await supriya.engine.start();
    await sujata.db.questions.add(q('s1', 'Sujata question'));
    await supriya.db.questions.add(q('p1', 'Supriya question'));
    await supriya.db.questions.delete('p1');
    await supriya.db.questions.add(q('p2', 'Supriya second'));
    await sujata.engine.pushNow();
    await supriya.engine.pushNow();
    await settle();

    expect((await sujata.db.questions.toArray()).map((x) => x.id)).toEqual(['s1']);
    expect((await supriya.db.questions.toArray()).map((x) => x.id)).toEqual(['p2']);
    expect([...server.space('uid-sujata').keys()]).toEqual(['questions__s1']);
    expect([...server.space('uid-supriya').keys()].sort()).toEqual(['questions__p1', 'questions__p2']);
    // separate delete queues in shared storage
    expect(sujata.tombs.list()).toHaveLength(0);
  });

  it('refuses to read or write another account’s space', async () => {
    const server = new FakeServer();
    const intruder = server.remote('uid-supriya', 'uid-sujata');
    await expect(intruder.push([{ table: 'questions', id: 'x', data: {}, updatedAt: '', deleted: false }])).rejects.toThrow('permission-denied');
    expect(() => intruder.subscribe(0, () => undefined, () => undefined)).toThrow('permission-denied');
  });
});

import { maskPhone } from '../app/account';
describe('phone masking', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98••••••10');
    expect(maskPhone('+14155550123')).toBe('+14155••••23');
  });
});
