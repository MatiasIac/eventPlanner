export class ApiFailure extends Error {
  constructor(message: string, public status = 0, public fields: Record<string, string> = {}, public current?: any) { super(message); }
}
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export async function api<T = any>(path: string, options: { method?: string; body?: unknown; key?: string } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (method !== 'GET') Object.assign(headers, { 'Content-Type': 'application/json', 'X-Wedding-Request': '1', 'X-CSRF-Token': csrf, 'Idempotency-Key': options.key ?? crypto.randomUUID() });
  let response: Response;
  try { response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}), signal: AbortSignal.timeout(25000) }); }
  catch { throw new ApiFailure('Could not connect. Your changes have not been confirmed. Keep this form open and try Save again.'); }
  let data;
  try { data = await response.json(); } catch { throw new ApiFailure('The server could not respond. Please try again.', response.status); }
  if (!response.ok) throw new ApiFailure(data.error ?? 'Could not save. Please try again.', response.status, data.fields, data.current);
  return data as T;
}
