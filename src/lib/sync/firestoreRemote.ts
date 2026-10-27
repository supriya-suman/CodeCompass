import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore
} from 'firebase/firestore';
import type { RemoteDoc, RemoteStore } from './engine';

/**
 * Firestore layout: users/{uid}/records/{table}__{id}
 * Security rules (firestore.rules) allow a signed-in user to read and write
 * only under their own uid. This client also only ever builds paths from the
 * signed-in uid, never from data.
 */
const BATCH = 400; // Firestore allows 500 writes per batch

export function recordsPath(uid: string) {
  return `users/${uid}/records`;
}

export class FirestoreRemote implements RemoteStore {
  constructor(private fs: Firestore, private uid: string) {}

  async push(docs: RemoteDoc[]) {
    const col = collection(this.fs, recordsPath(this.uid));
    for (let i = 0; i < docs.length; i += BATCH) {
      const batch = writeBatch(this.fs);
      for (const d of docs.slice(i, i + BATCH)) {
        batch.set(doc(col, `${d.table}__${d.id}`), {
          table: d.table,
          id: d.id,
          data: d.data,
          updatedAt: d.updatedAt,
          deleted: d.deleted,
          serverUpdatedAt: serverTimestamp()
        });
      }
      await batch.commit();
    }
  }

  subscribe(sinceMs: number, onDocs: (docs: RemoteDoc[]) => void, onError: (e: Error) => void) {
    const q = query(
      collection(this.fs, recordsPath(this.uid)),
      where('serverUpdatedAt', '>=', Timestamp.fromMillis(sinceMs)),
      orderBy('serverUpdatedAt')
    );
    return onSnapshot(
      q,
      (snap) => {
        const docs: RemoteDoc[] = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
          const v = ch.doc.data();
          const ts = v.serverUpdatedAt as Timestamp | null;
          docs.push({ table: v.table, id: v.id, data: v.data ?? null, updatedAt: v.updatedAt, deleted: !!v.deleted, serverMs: ts ? ts.toMillis() : undefined });
        }
        onDocs(docs);
      },
      (e) => onError(e)
    );
  }

  /** Permanently delete every cloud record of this account (used by account deletion). */
  async deleteAll() {
    const col = collection(this.fs, recordsPath(this.uid));
    for (;;) {
      const snap = await getDocs(query(col));
      if (snap.empty) return;
      const batch = writeBatch(this.fs);
      snap.docs.slice(0, BATCH).forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size <= BATCH) return;
    }
  }
}
