import type { IncomingMessage, ServerResponse } from 'node:http';
import { productionDeps } from '../_lib/deps.js';
import { verifyEmailOtp } from '../_lib/emailOtp.js';
import { guard, readJson, send } from '../_lib/http.js';

/** POST /api/auth/email-verify  { email, code } → { token } for Firebase signInWithCustomToken. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!guard(req, res)) return;
  try {
    const body = await readJson(req);
    send(res, await verifyEmailOtp(productionDeps(), body.email, body.code));
  } catch (e) {
    console.error('email-verify failed', e instanceof Error ? e.message : e);
    send(res, { status: 500, body: { ok: false, error: 'Sign-in is temporarily unavailable.' } });
  }
}
