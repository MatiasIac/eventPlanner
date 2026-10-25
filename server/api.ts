import { z, ZodError } from 'zod';
import { database, transaction } from './db';
import { ApiError } from './errors';
import { authenticate, checkCredential, cookie, csrf, csrfCheck, hash, join, organiser, originCheck, rateLimit, sessionToken } from './auth';
import { joinSchema } from '../shared/validation';
import { timeline } from './timeline';
import { mutate } from './mutations';
import { boundedBody } from './http';

const responseHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie' };
function json(body: unknown, status = 200, extra: Record<string, string> = {}) { return new Response(JSON.stringify(body), { status, headers: { ...responseHeaders, 'Content-Type': 'application/json', ...extra } }); }
export async function handle(request: Request, ip = 'local'): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/(?:api|\.netlify\/functions\/api)/, '') || '/';
    const method = request.method;
    if (method === 'GET' && path === '/health') { await database().query('SELECT 1 FROM wedding LIMIT 1'); return json({ ok: true }); }
    const isWrite = !['GET', 'HEAD'].includes(method);
    if (isWrite) originCheck(request);
    let bytes: Buffer = Buffer.alloc(0); let body: unknown = {};
    if (isWrite) {
      bytes = await boundedBody(request, 16384);
      {
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'Send this request as JSON.');
        try { body = JSON.parse(bytes.toString('utf8') || '{}'); } catch { throw new ApiError(400, 'The request could not be read.'); }
      }
    }
    if (method === 'POST' && path === '/session/join') {
      await rateLimit(`access:${ip}`, 30, 900);
      const result = await transaction(async c => {
        const data = joinSchema.parse(body);
        if (!data.organiser) throw new ApiError(403, 'Guests can open the timeline directly. Only organisers need to sign in.');
        checkCredential(data.code); return join(c, data.display_name, true);
      });
      return json(result.body, 200, { 'Set-Cookie': result.cookie });
    }
    if (method === 'POST' && path === '/session/guest') {
      // An ordinary visit creates an anonymous identity without any sign-in UI.
      // Reuse its cookie on reload so ownership and volunteering remain stable.
      try { const participant = await authenticate(request); return json({ participant, csrf: csrf(sessionToken(request)) }); }
      catch (e) { if (!(e instanceof ApiError) || e.status !== 401) throw e; }
      await rateLimit(`guest:${ip}`, 120, 900);
      const result = await transaction(c => join(c, 'Guest', false));
      return json(result.body, 200, { 'Set-Cookie': result.cookie });
    }
    const participant = await authenticate(request);
    if (method === 'GET' && path === '/session') return json({ participant, csrf: csrf(sessionToken(request)) });
    if (method === 'GET' && ['/timeline', '/archive'].includes(path)) {
      if (path !== '/timeline') organiser(participant);
      const data = await transaction(async c => { await authenticate(request, c); return timeline(c, path !== '/timeline'); }, false);
      return json(data);
    }
    if (isWrite) {
      csrfCheck(request); await rateLimit(`write:${participant.id}`, 120, 60);
      if (path === '/session/logout' && method === 'POST') {
        await database().query('UPDATE sessions SET revoked=true WHERE token_hash=$1', [hash(sessionToken(request))]);
        return json({ ok: true }, 200, { 'Set-Cookie': cookie('', true) });
      }
      if (path === '/session/name' && method === 'POST') {
        const name = z.object({ display_name: z.string().trim().min(1).max(80) }).parse(body).display_name;
        const p = await transaction(async c => {
          const current = await authenticate(request, c);
          return (await c.query('UPDATE participants SET display_name=$1,updated_at=now() WHERE id=$2 RETURNING id,display_name,role', [name,current.id])).rows[0];
        });
        return json({ participant: p, csrf: csrf(sessionToken(request)) });
      }
      const key = z.uuid().parse(request.headers.get('idempotency-key'));
      const fingerprint = hash(`${method}:${path}:${bytes.toString('base64')}`);
      const result = await transaction(async c => {
        const p = await authenticate(request, c);
        const previous = (await c.query('SELECT * FROM idempotency WHERE participant_id=$1 AND request_id=$2', [p.id, key])).rows[0];
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'This retry contains different information. Start a new save.');
          return previous.response;
        }
        const result = await mutate(c, p, method, path, body);
        await c.query('INSERT INTO idempotency(participant_id,request_id,fingerprint,response) VALUES($1,$2,$3,$4)', [p.id, key, fingerprint, JSON.stringify(result)]);
        // Bounded housekeeping runs only during use. Creation request IDs are kept
        // permanently so even delayed retries cannot duplicate contributions.
        await c.query('DELETE FROM rate_limits WHERE expires_at < now()');
        await c.query('DELETE FROM sessions WHERE expires_at < now()');
        return result;
      });
      return json(result);
    }
    throw new ApiError(404, 'This request could not be found.');
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
      return json({ error: 'Please check the highlighted information.', fields }, 400);
    }
    if (error instanceof ApiError) return json({ error: error.message, current: error.current, fields: error.fields }, error.status);
    // Never log credentials, request bodies, SQL parameters or raw error messages.
    console.error('Planner API request failed', { category: error instanceof Error ? error.name : 'UnknownError' });
    return json({ error: 'Could not save or load right now. Your text is safe to retry. Please try again shortly.' }, 503);
  }
}
