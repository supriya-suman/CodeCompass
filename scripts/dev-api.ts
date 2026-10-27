// Local stand-in for Vercel functions: serves /api/* on http://127.0.0.1:3001.
// `npm run dev` proxies /api here. Reads .env.local, or the env file given as
// the first argument (e.g. `tsx scripts/dev-api.ts .env.emulator`).
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

const envFile = process.argv[2] ?? process.env.DEV_API_ENV ?? '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const routes: Record<string, () => Promise<{ default: (req: never, res: never) => Promise<void> }>> = {
  '/api/auth/email-start': () => import('../api/auth/email-start.js'),
  '/api/auth/email-verify': () => import('../api/auth/email-verify.js')
};

const port = Number(process.env.DEV_API_PORT ?? 3001);
createServer(async (req, res) => {
  const path = (req.url ?? '').split('?')[0];
  const load = routes[path];
  if (!load) {
    res.statusCode = 404;
    return res.end();
  }
  const mod = await load();
  await mod.default(req as never, res as never);
}).listen(port, '127.0.0.1', () => console.log(`dev API on http://127.0.0.1:${port}`));
