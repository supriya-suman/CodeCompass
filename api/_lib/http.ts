import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OtpResult } from './emailOtp.js';

type Req = IncomingMessage & { body?: unknown };

/** Reads a small JSON body (Vercel pre-parses it; a plain Node server doesn't). */
export async function readJson(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') return safeParse(req.body);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 4096) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  return safeParse(Buffer.concat(chunks).toString('utf8'));
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

export function send(res: ServerResponse, r: OtpResult) {
  res.statusCode = r.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (r.status === 429 && 'retryAfterSec' in r.body && r.body.retryAfterSec) res.setHeader('Retry-After', String(r.body.retryAfterSec));
  res.end(JSON.stringify(r.body));
}

/** Only same-origin POSTs; the app and API are served from one domain. */
export function guard(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return false;
  }
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (origin && host && new URL(origin).host !== host) {
    res.statusCode = 403;
    res.end();
    return false;
  }
  return true;
}
