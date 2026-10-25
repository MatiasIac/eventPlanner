import pg from 'pg';
import { getConnectionString } from '@netlify/database';
import { deployment } from './runtime';
export const localMode = () => ['local', 'test'].includes(process.env.APP_ENV ?? '') && !process.env.NETLIFY && !deployment.getStore();
let pool: pg.Pool | undefined;
export function database(): pg.Pool {
  if (!pool) {
    let connectionString: string;
    if (localMode()) {
      connectionString = process.env.LOCAL_DATABASE_URL ?? '';
      const url = new URL(connectionString);
      if (!['localhost', '127.0.0.1', 'db', 'test-db'].includes(url.hostname)) throw new Error('Local database must use a local host.');
    } else {
      if (process.env.LOCAL_DATABASE_URL) throw new Error('LOCAL_DATABASE_URL is forbidden in Netlify environments.');
      connectionString = getConnectionString();
    }
    pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000 });
    pg.types.setTypeParser(1082, v => v);
    pg.types.setTypeParser(20, v => Number(v));
  }
  return pool;
}
export type Client = pg.PoolClient;
export async function transaction<T>(fn: (client: Client) => Promise<T>, write = true): Promise<T> {
  const client = await database().connect();
  try {
    await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // One wedding: serialize writes with a database lock. Reads remain concurrent,
    // and revision checks are per record. Every tree mutation uses this lock.
    if (write) await client.query('SELECT id FROM wedding WHERE id = 1 FOR UPDATE');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
