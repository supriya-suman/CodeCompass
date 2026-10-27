// Security-rules tests. Needs the Firestore emulator (Java 11+):
//   npm run test:rules
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const record = (id = 'q1', extra: Record<string, unknown> = {}) => ({
  table: 'questions',
  id,
  data: { id, title: 'Two Sum' },
  updatedAt: '2026-10-27T10:00:00.000Z',
  deleted: false,
  serverUpdatedAt: serverTimestamp(),
  ...extra
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codecompass',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

describe('each account is private', () => {
  it('owner can create, read, update and delete their own records', async () => {
    const db = env.authenticatedContext('sujata').firestore();
    const ref = doc(db, 'users/sujata/records/questions__q1');
    await assertSucceeds(setDoc(ref, record()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, record('q1', { deleted: true, data: null })));
    await assertSucceeds(deleteDoc(ref));
  });

  it('another signed-in user cannot read, list, write or delete them', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/sujata/records/questions__q1'), { ...record(), serverUpdatedAt: new Date() });
    });
    const other = env.authenticatedContext('supriya').firestore();
    await assertFails(getDoc(doc(other, 'users/sujata/records/questions__q1')));
    await assertFails(getDocs(collection(other, 'users/sujata/records')));
    await assertFails(setDoc(doc(other, 'users/sujata/records/questions__q2'), record('q2')));
    await assertFails(deleteDoc(doc(other, 'users/sujata/records/questions__q1')));
  });

  it('signed-out visitors get nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users/sujata/records/questions__q1')));
    await assertFails(setDoc(doc(anon, 'users/sujata/records/questions__q1'), record()));
  });

  it('nothing outside users/{uid}/records is readable or writable', async () => {
    const db = env.authenticatedContext('sujata').firestore();
    await assertFails(setDoc(doc(db, 'users/sujata'), { phone: '+91' }));
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(setDoc(doc(db, 'anything/else'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'otpChallenges/abc')));
    await assertFails(getDocs(collection(db, 'otpIps')));
  });
});

describe('record shape is enforced', () => {
  const db = () => env.authenticatedContext('sujata').firestore();
  it('rejects unknown tables, mismatched ids, extra fields and client-set timestamps', async () => {
    await assertFails(setDoc(doc(db(), 'users/sujata/records/secrets__x'), { ...record('x'), table: 'secrets' }));
    await assertFails(setDoc(doc(db(), 'users/sujata/records/questions__other'), record('q1')));
    await assertFails(setDoc(doc(db(), 'users/sujata/records/questions__q1'), { ...record(), owner: 'supriya' }));
    await assertFails(setDoc(doc(db(), 'users/sujata/records/questions__q1'), { ...record(), serverUpdatedAt: new Date(0) }));
    await assertFails(setDoc(doc(db(), 'users/sujata/records/questions__q1'), record('q1', { deleted: true })));
  });
});
