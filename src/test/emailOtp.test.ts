import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../api/_lib/deps.js';
import { MAX_ATTEMPTS, startEmailOtp, verifyEmailOtp, type OtpDeps } from '../../api/_lib/emailOtp.js';

function setup() {
  let t = 1_000_000;
  const sent: { to: string; code: string }[] = [];
  const accounts = new Map<string, string>();
  let n = 0;
  const deps: OtpDeps = {
    store: memoryStore(),
    secret: 'x'.repeat(40),
    now: () => t,
    makeCode: () => String(100000 + ++n),
    mailer: { async sendCode(to, code) { sent.push({ to, code }); } },
    issuer: { async tokenForEmail(email) { if (!accounts.has(email)) accounts.set(email, `uid-${accounts.size + 1}`); return `token-for-${accounts.get(email)}`; } }
  };
  return { deps, sent, accounts, advance: (ms: number) => (t += ms) };
}

describe('email one-time code', () => {
  it('sends a code and exchanges it for a sign-in token once', async () => {
    const { deps, sent } = setup();
    expect((await startEmailOtp(deps, 'Asha@Example.com ', '1.1.1.1')).status).toBe(200);
    expect(sent[0].to).toBe('asha@example.com');
    const ok = await verifyEmailOtp(deps, 'asha@example.com', sent[0].code);
    expect(ok).toEqual({ status: 200, body: { ok: true, token: 'token-for-uid-1' } });
    // single use
    expect((await verifyEmailOtp(deps, 'asha@example.com', sent[0].code)).status).toBe(400);
  });

  it('gives each email its own account, and the same email the same account', async () => {
    const { deps, sent, advance } = setup();
    await startEmailOtp(deps, 'a@x.io', 'ip');
    const a1 = await verifyEmailOtp(deps, 'a@x.io', sent[0].code);
    await startEmailOtp(deps, 'b@x.io', 'ip');
    const b = await verifyEmailOtp(deps, 'b@x.io', sent[1].code);
    advance(61_000);
    await startEmailOtp(deps, 'A@X.IO', 'ip');
    const a2 = await verifyEmailOtp(deps, 'a@x.io', sent[2].code);
    expect(a1.body).toMatchObject({ token: 'token-for-uid-1' });
    expect(b.body).toMatchObject({ token: 'token-for-uid-2' });
    expect(a2.body).toMatchObject({ token: 'token-for-uid-1' });
  });

  it('rejects a code meant for another email', async () => {
    const { deps, sent } = setup();
    await startEmailOtp(deps, 'a@x.io', 'ip');
    await startEmailOtp(deps, 'b@x.io', 'ip');
    expect((await verifyEmailOtp(deps, 'b@x.io', sent[0].code)).status).toBe(400);
  });

  it('locks after too many wrong codes, even if the right one comes later', async () => {
    const { deps, sent } = setup();
    await startEmailOtp(deps, 'a@x.io', 'ip');
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await verifyEmailOtp(deps, 'a@x.io', '000000')).status).toBe(400);
    expect((await verifyEmailOtp(deps, 'a@x.io', sent[0].code)).status).toBe(400);
  });

  it('expires codes after 10 minutes', async () => {
    const { deps, sent, advance } = setup();
    await startEmailOtp(deps, 'a@x.io', 'ip');
    advance(10 * 60_000 + 1);
    const r = await verifyEmailOtp(deps, 'a@x.io', sent[0].code);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: expect.stringMatching(/expired/) });
  });

  it('rate limits resends per email and per network', async () => {
    const { deps, advance } = setup();
    await startEmailOtp(deps, 'a@x.io', 'ip1');
    const fast = await startEmailOtp(deps, 'a@x.io', 'ip1');
    expect(fast.status).toBe(429);
    expect(fast.body).toMatchObject({ retryAfterSec: 60 });
    for (let i = 0; i < 4; i++) {
      advance(61_000);
      expect((await startEmailOtp(deps, 'a@x.io', 'ip1')).status).toBe(200);
    }
    advance(61_000);
    expect((await startEmailOtp(deps, 'a@x.io', 'ip1')).status).toBe(429); // 5 per hour
    const { deps: d2 } = setup();
    for (let i = 0; i < 20; i++) expect((await startEmailOtp(d2, `u${i}@x.io`, 'same-ip')).status).toBe(200);
    expect((await startEmailOtp(d2, 'u99@x.io', 'same-ip')).status).toBe(429);
  });

  it('validates input and configuration', async () => {
    const { deps } = setup();
    expect((await startEmailOtp(deps, 'not-an-email', 'ip')).status).toBe(400);
    expect((await verifyEmailOtp(deps, 'a@x.io', '12ab')).status).toBe(400);
    expect((await startEmailOtp({ ...deps, secret: 'short' }, 'a@x.io', 'ip')).status).toBe(500);
  });

  it('reports a mail failure without leaking details', async () => {
    const { deps } = setup();
    const r = await startEmailOtp({ ...deps, mailer: { sendCode: async () => { throw new Error('SMTP 535 bad password'); } } }, 'a@x.io', 'ip');
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toMatch(/535|password/);
  });
});
