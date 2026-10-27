import type { Transaction } from 'dexie';
import { SYNC_TABLES, type CompassDB, type SyncTable } from '../db';

/**
 * Change tracking for sync, installed with Dexie hooks so that every write in
 * the app is captured — pages don't need to know sync exists.
 *
 * - Creates and updates stamp `updatedAt` and `_dirty: 1` inside the same
 *   IndexedDB transaction as the write, so a change can't be committed
 *   without also being marked for upload.
 * - Deletes are recorded as tombstones in localStorage synchronously when the
 *   transaction commits, then uploaded so other devices remove the record.
 * - Writes made by the sync engine itself (applying cloud data) run in a
 *   transaction flagged as remote and are not tracked.
 */

const REMOTE = '__ccRemote';

export function markRemote(tx: Transaction | null | undefined) {
  if (tx) (tx as unknown as Record<string, boolean>)[REMOTE] = true;
}
const isRemote = (tx: Transaction) => (tx as unknown as Record<string, boolean>)[REMOTE] === true;

export interface Tombstone {
  table: SyncTable;
  id: string;
  at: string; // ISO time of deletion
}

/** Pending deletes for one account, persisted per account so users never share a queue. */
export class TombstoneStore {
  constructor(private key: string, private storage: Storage = localStorage) {}
  list(): Tombstone[] {
    try {
      const v = JSON.parse(this.storage.getItem(this.key) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  private save(list: Tombstone[]) {
    if (list.length) this.storage.setItem(this.key, JSON.stringify(list));
    else this.storage.removeItem(this.key);
  }
  add(t: Tombstone) {
    this.save([...this.list().filter((x) => !(x.table === t.table && x.id === t.id)), t]);
  }
  remove(table: string, id: string, onlyIfAt?: string) {
    this.save(this.list().filter((x) => !(x.table === table && x.id === id && (!onlyIfAt || x.at === onlyIfAt))));
  }
  clear() {
    this.storage.removeItem(this.key);
  }
}

export const tombstoneKey = (uid: string) => `codecompass.tombstones.${uid}`;

export function installTracking(db: CompassDB, tombstones: TombstoneStore, onChange: () => void, clock: () => string = () => new Date().toISOString()) {
  const unsubs: (() => void)[] = [];
  for (const name of SYNC_TABLES) {
    const table = db.table(name);
    const creating = function (this: unknown, primKey: unknown, obj: Record<string, unknown>, tx: Transaction) {
      if (isRemote(tx)) return;
      obj.updatedAt = clock();
      obj._dirty = 1;
      const id = String(primKey ?? obj.id);
      tx.on('complete', () => {
        tombstones.remove(name, id);
        onChange();
      });
    };
    const updating = function (this: unknown, _mods: object, primKey: unknown, _obj: unknown, tx: Transaction) {
      if (isRemote(tx)) return undefined;
      tx.on('complete', onChange);
      void primKey;
      return { updatedAt: clock(), _dirty: 1 };
    };
    const deleting = function (this: unknown, primKey: unknown, _obj: unknown, tx: Transaction) {
      if (isRemote(tx)) return;
      const at = clock();
      tx.on('complete', () => {
        tombstones.add({ table: name, id: String(primKey), at });
        onChange();
      });
    };
    table.hook('creating', creating as never);
    table.hook('updating', updating as never);
    table.hook('deleting', deleting as never);
    unsubs.push(() => {
      table.hook('creating').unsubscribe(creating as never);
      table.hook('updating').unsubscribe(updating as never);
      table.hook('deleting').unsubscribe(deleting as never);
    });
  }
  return () => unsubs.forEach((u) => u());
}
