import { ApiError } from './errors';
export async function boundedBody(request: Request, max: number): Promise<Buffer> {
  if (Number(request.headers.get('content-length')) > max) throw new ApiError(413, 'This request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > max) { await reader.cancel(); throw new ApiError(413, 'This request is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
