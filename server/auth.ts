import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { database, localMode, type Client } from './db';
import { ApiError } from './errors';
import type { Participant } from '../shared/model';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const randomSecret = () => randomBytes(32).toString('base64url');
const cookieName = () => localMode() || process.env.NETLIFY_DEV === 'true' ? 'wedding_session' : '__Host-wedding_session';
export function sessionToken(request: Request): string {
  return request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1) ?? '';
}
export const csrf = (token: string) => hash(`wedding-csrf:${token}`);
export function cookie(token: string, clear = false): string {
  const secure = cookieName().startsWith('__Host-') ? '; Secure' : '';
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 2592000}${secure}`;
}
export function originCheck(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-wedding-request') !== '1')
    throw new ApiError(403, 'Open the planner and try again. The request origin could not be verified.');
}
export function csrfCheck(request: Request) {
  const actual = request.headers.get('x-csrf-token') ?? '';
  if (actual !== csrf(sessionToken(request))) throw new ApiError(403, 'Your session changed. Refresh the page and try again.');
}
export async function authenticate(request: Request, client?: Client): Promise<Participant> {
  const token = sessionToken(request);
  if (!token) throw new ApiError(401, 'Open or reload the timeline to continue as a guest.');
  const result = await (client ?? database()).query(`SELECT p.id, p.display_name, p.role FROM sessions s
    JOIN participants p ON p.id=s.participant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.revoked AND NOT p.revoked`, [hash(token)]);
  if (!result.rowCount) throw new ApiError(401, 'Your browser session has ended. Reload the timeline to continue.');
  return result.rows[0];
}
export function organiser(p: Participant) { if (p.role !== 'organiser') throw new ApiError(403, 'Only an organiser can do this.'); }
export function owner(p: Participant, creator: string) { if (p.role !== 'organiser' && p.id !== creator) throw new ApiError(403, 'You can only change your own contributions.'); }
export function checkCredential(value: string) {
  const expected = process.env.ORGANISER_CREDENTIAL;
  if (!expected || expected.length < 16)
    throw new ApiError(503, 'Access has not been configured. Please contact the organiser.');
  if (!timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(expected)))) throw new ApiError(401, 'That code was not recognised. Please check it and try again.');
}
export async function issueSession(client: Client, participant: Participant) {
  const token = randomSecret();
  await client.query("INSERT INTO sessions(token_hash,participant_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [hash(token), participant.id]);
  return { body: { participant, csrf: csrf(token) }, cookie: cookie(token) };
}
export async function join(client: Client, displayName: string, isOrganiser: boolean) {
  const count = await client.query('SELECT count(*)::int AS count FROM participants');
  if (count.rows[0].count >= 2000) throw new ApiError(409, 'The participant limit has been reached. Please contact the organiser.');
  const p: Participant = { id: randomUUID(), display_name: displayName, role: isOrganiser ? 'organiser' : 'participant' };
  await client.query('INSERT INTO participants(id,display_name,role) VALUES($1,$2,$3)', [p.id, p.display_name, p.role]);
  return issueSession(client, p);
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const result = await database().query(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`, [hash(key), seconds]);
  if (result.rows[0].count > limit) throw new ApiError(429, 'Too many attempts. Please wait a few minutes before trying again.');
}
