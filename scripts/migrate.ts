import { readdir, readFile } from 'node:fs/promises';
import { database, localMode } from '../server/db';
if (!localMode()) throw new Error('This migration runner is only for Docker local/test databases. Netlify applies hosted migrations.');
const client = await database().connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(250102026)');
  await client.query('CREATE TABLE IF NOT EXISTS local_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir('netlify/database/migrations')).filter(x => x.endsWith('.sql')).sort();
  for (const file of files) {
    if ((await client.query('SELECT 1 FROM local_migrations WHERE name=$1', [file])).rowCount) continue;
    await client.query(await readFile(`netlify/database/migrations/${file}`, 'utf8'));
    await client.query('INSERT INTO local_migrations(name) VALUES($1)', [file]); console.log(`Applied ${file}`);
  }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await database().end(); }
