import type { IncomingMessage, ServerResponse } from 'node:http';
import { productionDeps } from '../_lib/deps.js';
import { startEmailOtp } from '../_lib/emailOtp.js';
import { clientIp, guard, readJson, send } from '../_lib/http.js';

/** POST /api/auth/email-start  { email } → emails a 6-digit sign-in code. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!guard(req, res)) return;
  try {
    const body = await readJson(req);
    send(res, await startEmailOtp(productionDeps(), body.email, clientIp(req)));
  } catch (e) {
    console.error('email-start failed', e instanceof Error ? e.message : e);
    send(res, { status: 500, body: { ok: false, error: 'Sign-in is temporarily unavailable.' } });
  }
}
