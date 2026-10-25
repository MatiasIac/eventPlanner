// Optional browser smoke check for the actual Netlify Dev proxy. Run locally only.
import { chromium } from '@playwright/test';
const origin = process.env.NETLIFY_CHECK_ORIGIN ?? 'http://localhost:8890';
if (!['localhost', '127.0.0.1', 'wedding-timeline-netlify-final'].includes(new URL(origin).hostname)) throw new Error('This check is for the local Netlify emulator only.');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/violates.*Content Security Policy|Refused to.*Content Security Policy/i.test(message.text())) errors.push(message.text()); });
  await page.goto(origin); await page.locator('.day-pages').waitFor();
  await page.getByRole('button', { name: '＋ Add activity', exact: true }).first().click();
  await page.getByLabel('Activity title').fill('Netlify browser verification (demonstration)');
  await page.getByLabel('I’ll take care of this', { exact: true }).check(); await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('article', { name: 'Netlify browser verification (demonstration)', exact: true }).waitFor();
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: Netlify Dev renders in Chromium, opens as a guest and saves an atomic activity offer without script or CSP errors.');
} finally { await browser.close(); }
