import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env already exists; it was left unchanged.');
} else {
  writeFileSync('.env', `ORGANISER_CREDENTIAL=${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
  console.log('Created .env with random local credentials. Open it locally to see your codes.');
}
