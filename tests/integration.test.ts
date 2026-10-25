import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handle } from '../server/api';
import { database } from '../server/db';
import { sortActivities, activityTime, type Activity } from '../shared/model';

type Guest = { id: string; cookie: string; csrf: string };
let alice: Guest, bob: Guest, admin: Guest;
if (process.env.APP_ENV !== 'test' || !new URL(process.env.LOCAL_DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Integration tests require an isolated _test database.');
async function request(path: string, method = 'GET', body?: unknown, guest?: Guest, key = randomUUID(), extra: Record<string, string> = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://wedding.test', 'X-Wedding-Request': '1', 'Idempotency-Key': key, ...(guest ? { Cookie: guest.cookie, 'X-CSRF-Token': guest.csrf } : {}), ...extra };
  const res = await handle(new Request(`http://wedding.test/api${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }), 'integration');
  const data = await res.json(); return { status: res.status, data, headers: res.headers };
}
async function join(name: string, organiser = false): Promise<Guest> {
  const r = organiser ? await request('/session/join', 'POST', { display_name: name, code: process.env.ORGANISER_CREDENTIAL, organiser }) : await request('/session/guest', 'POST', {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const guest = { id: r.data.participant.id, csrf: r.data.csrf, cookie: r.headers.get('set-cookie')!.split(';')[0] };
  if (!organiser) {
    assert.equal((await request('/session/name','POST',{display_name:name},guest)).status,200);
  }
  return guest;
}
async function activity(guest = alice, extra = {}) {
  const r = await request('/activities', 'POST', { title: 'Ceremony', start_time: null, timing_mode: 'linked', ...extra }, guest); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
}
async function job(activityId: string, guest = alice, extra = {}) {
  const r = await request(`/activities/${activityId}/jobs`, 'POST', { title: 'Carry the rings', capacity: 1, ...extra }, guest); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
}
before(async () => {
  await database().query('TRUNCATE idempotency,rate_limits,sessions,assignments,jobs,activities,images,participants CASCADE');
  await database().query("UPDATE wedding SET title='Matías & Lisa',date=NULL,venue='',timezone='Pacific/Auckland',revision=1,demonstration=false");
  alice = await join('Same name'); bob = await join('Same name'); admin = await join('Organiser', true);
});
after(async () => { await database().end(); });

test('private API, session hashes, separate organiser credential and same-origin CSRF', async () => {
  assert.equal((await request('/timeline')).status, 401);
  const bad = await request('/session/join', 'POST', { display_name: 'Wrong', code: 'not-the-code', role: 'organiser' }); assert.equal(bad.status, 403);
  assert.equal((await request('/session/join', 'POST', { display_name: 'Wrong', code: 'invalid-organiser-code', organiser: true })).status, 401);
  const stored = (await database().query('SELECT token_hash,return_hash FROM sessions JOIN participants ON participants.id=sessions.participant_id WHERE participants.id=$1', [alice.id])).rows[0];
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/); assert.equal(stored.return_hash, null);
  assert.equal((await request('/activities', 'POST', { title: 'Forged' }, alice, randomUUID(), { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await request('/activities', 'POST', { title: 'Forged' }, alice, randomUUID(), { 'X-CSRF-Token': 'wrong' })).status, 403);
  const timeline = await request('/timeline', 'GET', undefined, alice);
  assert.equal(timeline.headers.get('cache-control'), 'private, no-store');
  assert.equal(timeline.data.wedding.date, null); assert.equal(timeline.data.wedding.venue, '');
  assert(!JSON.stringify(timeline.data).includes('return_hash')); assert(!JSON.stringify(timeline.data).includes('token_hash'));
});

test('activity offers and job offers save ownership and assignment atomically', async () => {
  const a = await activity(alice, { title: 'Offer to bring flowers', take_care: true, responsibility_title: 'Bring the bouquet', creator_id: bob.id });
  assert.equal(a.creator_id, alice.id);
  const data = (await request('/timeline', 'GET', undefined, bob)).data;
  const j = data.jobs.find((j: any) => j.activity_id === a.id);
  assert.equal(j.title, 'Bring the bouquet'); assert.equal(data.assignments.find((s: any) => s.job_id === j.id).participant_id, alice.id);
  const ownJob = await job(a.id, bob, { title: 'Bring water', take_care: true });
  assert.equal((await database().query('SELECT manager_id FROM assignments WHERE job_id=$1', [ownJob.id])).rows[0].manager_id, bob.id);
  const noOffer = await activity(); assert.equal((await database().query('SELECT 1 FROM jobs WHERE activity_id=$1', [noOffer.id])).rowCount, 0);
});

test('downstream database failure rolls back both activity and job creation', async () => {
  const doomed = await join('Failure fixture'); const a = await activity();
  await database().query(`CREATE FUNCTION test_reject_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.manager_id='${doomed.id}'::uuid THEN RAISE EXCEPTION 'Test downstream failure'; END IF; RETURN NEW; END $$`);
  await database().query('CREATE TRIGGER test_reject_assignment BEFORE INSERT ON assignments FOR EACH ROW EXECUTE FUNCTION test_reject_assignment()');
  try {
    const result = await request('/activities', 'POST', { title: 'Must roll back', take_care: true }, doomed); assert.equal(result.status, 503);
    assert.equal((await database().query("SELECT 1 FROM activities WHERE title='Must roll back'")).rowCount, 0);
    const result2 = await request(`/activities/${a.id}/jobs`, 'POST', { title: 'Must roll back too', capacity: 1, take_care: true }, doomed); assert.equal(result2.status, 503);
    assert.equal((await database().query("SELECT 1 FROM jobs WHERE title='Must roll back too'")).rowCount, 0);
  } finally { await database().query('DROP TRIGGER test_reject_assignment ON assignments'); await database().query('DROP FUNCTION test_reject_assignment()'); }
});

test('simultaneous claims for the last place give exactly one winner and current job state', async () => {
  const a = await activity(); const j = await job(a.id);
  const results = await Promise.all([request(`/jobs/${j.id}/volunteer`, 'POST', {}, alice), request(`/jobs/${j.id}/volunteer`, 'POST', {}, bob)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(results.find(r => r.status === 409)!.data.current.assignments.length, 1);
  assert.equal((await database().query('SELECT 1 FROM assignments WHERE job_id=$1 AND active', [j.id])).rowCount, 1);
  const winner = results[0].status === 200 ? alice : bob;
  assert.equal((await request(`/jobs/${j.id}/volunteer`, 'POST', {}, winner)).status, 200);
});

test('concurrent retries never duplicate activities, jobs or nominations', async () => {
  const key = randomUUID(); const payload = { title: 'An idempotent activity', take_care: true };
  const [one, two] = await Promise.all([request('/activities', 'POST', payload, alice, key), request('/activities', 'POST', payload, alice, key)]);
  assert.equal(one.status, 200); assert.equal(two.data.id, one.data.id);
  assert.equal((await request('/activities', 'POST', { ...payload, title: 'Different content' }, alice, key)).status, 409);
  const jobKey = randomUUID(); const jobBody = { title: 'Flower girl', capacity: 4 };
  const j = await request(`/activities/${one.data.id}/jobs`, 'POST', jobBody, alice, jobKey);
  assert.equal((await request(`/activities/${one.data.id}/jobs`, 'POST', jobBody, alice, jobKey)).data.id, j.data.id);
  const nominationKey = randomUUID(); const route = `/jobs/${j.data.id}/nominate`;
  const [n1, n2] = await Promise.all([request(route, 'POST', { nominee_name: 'Child' }, bob, nominationKey), request(route, 'POST', { nominee_name: 'Child' }, bob, nominationKey)]);
  assert.equal(n1.data.id, n2.data.id);
  const distinct = await request(route, 'POST', { nominee_name: 'Child' }, bob); assert.notEqual(distinct.data.id, n1.data.id);
  const edited = await request(`/assignments/${n1.data.id}`, 'PUT', { nominee_name: 'New name', revision: 1 }, bob); assert.equal(edited.data.nominee_name, 'New name');
  assert.equal((await request(`/assignments/${n1.data.id}/withdraw`, 'POST', { revision: 2 }, bob)).status, 200);
  assert.equal((await request(`/jobs/${j.data.id}/volunteer`, 'POST', {}, alice)).status, 200);
});

test('direct API permissions use stable identities, including identical display names', async () => {
  assert.notEqual(alice.id, bob.id); const a = await activity(); const j = await job(a.id);
  assert.equal((await request(`/activities/${a.id}`, 'PUT', { ...a, start_time: '15:00' }, bob)).status, 403);
  assert.equal((await request(`/jobs/${j.id}`, 'PUT', { ...j, title: 'Wrong' }, bob)).status, 403);
  const n = await request(`/jobs/${j.id}/nominate`, 'POST', { nominee_name: 'Child' }, alice);
  assert.equal((await request(`/assignments/${n.data.id}`, 'PUT', { nominee_name: 'Wrong', revision: 1 }, bob)).status, 403);
  assert.equal((await request(`/assignments/${n.data.id}/withdraw`, 'POST', { revision: 1 }, bob)).status, 403);
  assert.equal((await request(`/assignments/${n.data.id}/withdraw`, 'POST', { revision: 1 }, admin)).status, 200);
  assert.equal((await request('/settings', 'PUT', {}, bob)).status, 403);
  assert.equal((await request('/archive', 'GET', undefined, bob)).status, 403);
  assert.equal((await request('/export', 'GET', undefined, bob)).status, 404);
});

test('stale revisions conflict while unrelated edits succeed; capacities cannot shrink below assignments', async () => {
  const a = await activity(); const other = await activity();
  const changed = await request(`/activities/${a.id}`, 'PUT', { ...a, placement: { mode: 'keep' }, title: 'Latest title' }, admin); assert.equal(changed.status, 200);
  const stale = await request(`/activities/${a.id}`, 'PUT', { ...a, placement: { mode: 'keep' }, title: 'Stale title' }, alice);
  assert.equal(stale.status, 409); assert.equal(stale.data.current.title, 'Latest title');
  assert.equal((await request(`/activities/${other.id}`, 'PUT', { ...other, placement: { mode: 'keep' }, title: 'Unrelated edit' }, alice)).status, 200);
  const j = await job(a.id, alice, { capacity: 2 }); await request(`/jobs/${j.id}/volunteer`, 'POST', {}, alice); await request(`/jobs/${j.id}/volunteer`, 'POST', {}, bob);
  assert.equal((await request(`/jobs/${j.id}`, 'PUT', { ...j, capacity: 1 }, alice)).status, 409);
});

test('capacity edit, archive and volunteering share the same transaction lock', async () => {
  const a = await activity(); const j = await job(a.id, alice, { capacity: 2, take_care: true });
  const [claim, resize] = await Promise.all([request(`/jobs/${j.id}/volunteer`, 'POST', {}, bob), request(`/jobs/${j.id}`, 'PUT', { ...j, capacity: 1 }, admin)]);
  assert.deepEqual([claim.status, resize.status].sort(), [200, 409]);
  const k = await job(a.id, alice, { title: 'Archive race' });
  const outcomes = await Promise.all([request(`/jobs/${k.id}/volunteer`, 'POST', {}, bob), request(`/activities/${a.id}/archive`, 'POST', { revision: 1 }, admin)]);
  assert.equal(outcomes[1].status, 200); assert([200, 409].includes(outcomes[0].status));
  assert.equal((await request(`/jobs/${k.id}/volunteer`, 'POST', {}, alice)).status, 409);
});

test('soft archive retains flags and assignments; restore keeps separately archived jobs and withdrawals', async () => {
  const a = await activity(); const j = await job(a.id, alice, { capacity: 2 }); const hidden = await job(a.id);
  const s = await request(`/jobs/${j.id}/volunteer`, 'POST', {}, bob);
  const withdrawn = await request(`/jobs/${j.id}/nominate`, 'POST', { nominee_name: 'Former helper' }, alice);
  await request(`/assignments/${withdrawn.data.id}/withdraw`, 'POST', { revision: 1 }, alice);
  assert.equal((await request(`/activities/${a.id}/archive`, 'POST', { revision: 1 }, alice)).status, 403);
  assert.equal((await request(`/jobs/${hidden.id}/archive`, 'POST', { revision: 1 }, alice)).status, 200);
  assert.equal((await request(`/activities/${a.id}/archive`, 'POST', { revision: 1 }, admin)).status, 200);
  assert.equal((await request(`/jobs/${hidden.id}/restore`, 'POST', { revision: 2 }, admin)).status, 409);
  assert.equal((await database().query('SELECT active FROM assignments WHERE id=$1', [s.data.id])).rows[0].active, true);
  assert.equal((await database().query('SELECT archived FROM jobs WHERE id=$1', [j.id])).rows[0].archived, false);
  assert.equal((await request(`/activities/${a.id}/restore`, 'POST', { revision: 2 }, admin)).status, 200);
  const state = (await request('/timeline', 'GET', undefined, alice)).data;
  assert(state.jobs.some((x: any) => x.id === j.id)); assert(!state.jobs.some((x: any) => x.id === hidden.id));
  assert(state.assignments.some((x: any) => x.id === s.data.id)); assert(!state.assignments.some((x: any) => x.id === withdrawn.data.id));
});

test('local times include next day and explicit ends; wedding settings preserve the running order', async () => {
  const a = await activity(alice, { title: 'Late', start_time: '23:30', duration_minutes: 30 });
  const b = await activity(alice, { title: 'Next', start_time: '00:30', day_offset: 1, duration_minutes: 15 });
  const c = await activity(alice, { title: 'Untimed', start_time: null });
  assert.deepEqual(sortActivities([c, b, a]).map(x => x.id), [a.id, c.id, b.id]);
  assert.match(activityTime(b), /^1 day after/);
  assert.equal((await request('/activities', 'POST', { title: 'Invalid end', start_time: '23:30', end_time: '00:30' }, alice)).status, 400);
  assert.equal((await request('/activities', 'POST', { title: 'Valid end', start_time: '23:30', end_time: '00:30', end_day_offset: 1 }, alice)).status, 200);
  const timeline = (await request('/timeline', 'GET', undefined, alice)).data;
  const previous = timeline.activities.find((a: Activity) => a.id === b.id).start_time;
  assert.equal((await request('/settings', 'PUT', { ...timeline.wedding, start_time: timeline.wedding.start_time.slice(0,5), date: '2027-01-15', timezone: 'Pacific/Auckland' }, admin)).status, 200);
  assert.equal((await database().query('SELECT start_time FROM activities WHERE id=$1', [b.id])).rows[0].start_time, previous);
});

test('removed access, export and upload routes are unavailable; only bundled icons are exposed', async () => {
  for (const [path, method] of [['/export','GET'], ['/images','POST'], ['/images/'+randomUUID(),'GET'], ['/session/return-code','POST'], ['/session/recover','POST'], ['/participants/'+alice.id+'/revoke','POST']]) {
    assert.equal((await request(path, method, {}, admin)).status, 404, path);
  }
  const a = await activity(alice, { illustration: 'music' });
  const state = (await request('/timeline', 'GET', undefined, alice)).data;
  assert.equal(state.wedding.timezone, undefined);
  const row = state.activities.find((x: Activity) => x.id === a.id);
  assert.equal(row.illustration, 'music'); assert.equal(row.image_id, undefined); assert.equal(row.image_alt, undefined);
  assert.equal((await request('/session/guest','POST',{},alice)).data.return_code, undefined);
});

async function schedule() { return (await request('/timeline', 'GET', undefined, admin)).data; }
async function resetSchedule() {
  await database().query('TRUNCATE activities CASCADE');
  await database().query('UPDATE wedding SET schedule_revision=schedule_revision+1');
}
async function updateTiming(id: string, values: Record<string, unknown>, guest = admin) {
  const state = await schedule(), a = state.activities.find((a: Activity) => a.id === id);
  return request(`/activities/${id}`, 'PUT', { title: a.title, revision: a.revision, duration_minutes: a.duration_minutes, placement: { mode: 'keep' }, schedule_revision: state.wedding.schedule_revision, ...values }, guest);
}
const starts = (state: any) => state.activities.map((a: Activity) => [a.title, a.start_time?.slice(0,5), a.day_offset]);

test('relative drafts push all later activities; retries and organiser approval do not shift twice', async () => {
  await resetSchedule();
  const ceremony = await activity(admin, { title: 'Ceremony', start_time: '14:00', duration_minutes: 30, confirm: true });
  const photos = await activity(admin, { title: 'Photos', start_time: '14:30', duration_minutes: 45, confirm: true });
  await activity(admin, { title: 'Dinner', start_time: '18:00', duration_minutes: 60, confirm: true });
  const before = await schedule(), key = randomUUID();
  const payload = { title: 'A surprise', duration_minutes: 10, placement: { mode: 'relative', anchor_id: ceremony.id, position: 'after' }, schedule_revision: before.wedding.schedule_revision };
  const [one, retry] = await Promise.all([request('/activities', 'POST', payload, alice, key), request('/activities', 'POST', payload, alice, key)]);
  assert.equal(one.status, 200, JSON.stringify(one.data)); assert.equal(one.data.id, retry.data.id); assert.equal(one.data.status, 'draft');
  assert.deepEqual(starts(await schedule()), [['Ceremony','14:00',0],['A surprise','14:30',0],['Photos','14:40',0],['Dinner','18:10',0]]);
  assert.equal((await request(`/activities/${one.data.id}/confirm`, 'POST', { revision: one.data.revision }, alice)).status, 403);
  assert.equal((await request('/activities', 'POST', { ...payload, confirm: true, schedule_revision: (await schedule()).wedding.schedule_revision }, alice)).status, 403);
  const planned = await schedule();
  const confirmed = await request(`/activities/${one.data.id}/confirm`, 'POST', { revision: one.data.revision }, admin);
  assert.equal(confirmed.data.status, 'confirmed'); assert.equal(confirmed.data.confirmed_by, admin.id);
  assert.deepEqual(starts(await schedule()), starts(planned));
  assert.equal((await schedule()).wedding.schedule_revision, planned.wedding.schedule_revision);
  assert.equal((await updateTiming(one.data.id, { duration_minutes: 15 }, alice)).status, 403);
  assert.equal((await updateTiming(photos.id, { duration_minutes: 60 })).status, 200);
  assert.deepEqual(starts(await schedule()), [['Ceremony','14:00',0],['A surprise','14:30',0],['Photos','14:40',0],['Dinner','18:25',0]]);
});

test('before insertion and own draft duration changes are shared; concurrent schedule edits are rejected atomically', async () => {
  await resetSchedule();
  const anchor = await activity(admin, { start_time: '14:00', duration_minutes: 30 });
  await activity(admin, { title: 'Photos', start_time: '14:30', duration_minutes: 45 });
  const state = await schedule();
  const input = { title: 'Guest greeting', duration_minutes: 5, placement: { mode: 'relative', anchor_id: anchor.id, position: 'before' }, schedule_revision: state.wedding.schedule_revision };
  const results = await Promise.all([request('/activities', 'POST', input, alice), request('/activities', 'POST', { ...input, title: 'Competing addition' }, bob)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,409]);
  assert.equal((await schedule()).activities.length, 3);
  const winner = results[0].status === 200 ? alice : bob, addition = results.find(r => r.status === 200)!.data;
  assert.equal((await updateTiming(addition.id, { duration_minutes: 15 }, winner)).status, 200);
  const next = await schedule();
  assert.equal(next.activities[0].start_time, '14:00:00');
  assert.equal(next.activities[1].start_time, '14:15:00');
  assert.equal(next.activities[2].start_time, '14:45:00');
  const stale = await request('/activities', 'POST', input, alice);
  assert.equal(stale.status, 409); assert.equal(stale.data.current.schedule_revision, next.wedding.schedule_revision);
  assert.deepEqual(starts(await schedule()), starts(next));
});

test('only organisers can shuffle activities using relative placement or absolute clock edits', async () => {
  await resetSchedule();
  const a = await activity(alice, { title: 'A', start_time: '14:00', duration_minutes: 30 });
  const b = await activity(alice, { title: 'B', start_time: '14:30', duration_minutes: 15 });
  const c = await activity(alice, { title: 'C', start_time: '14:45', duration_minutes: 45 });
  let state = await schedule();
  const placement = { mode: 'relative', anchor_id: a.id, position: 'before' };
  assert.equal((await request(`/activities/${c.id}/move`, 'POST', { revision: c.revision, schedule_revision: state.wedding.schedule_revision, placement }, alice)).status, 403);
  assert.equal((await updateTiming(c.id, { placement }, alice)).status, 403);
  assert.equal((await updateTiming(c.id, { placement: { mode: 'absolute', start_time: '12:00', day_offset: 0 } }, alice)).status, 403);
  assert.equal((await request(`/activities/${c.id}/move`, 'POST', { revision: c.revision, schedule_revision: state.wedding.schedule_revision, placement }, admin)).status, 200);
  assert.deepEqual(starts(await schedule()), [['C','14:00',0],['A','14:45',0],['B','15:15',0]]);
  state = await schedule(); const moved = state.activities.find((x: Activity) => x.id === c.id);
  assert.equal((await request(`/activities/${c.id}/move`, 'POST', { revision: moved.revision, schedule_revision: state.wedding.schedule_revision, direction: 'down' }, admin)).status, 200);
  assert.deepEqual(starts(await schedule()), [['A','14:00',0],['C','14:30',0],['B','15:15',0]]);
  assert.equal((await updateTiming(b.id, { placement: { mode: 'absolute', start_time: '13:00', day_offset: 0 } })).status, 200);
  assert.deepEqual(starts(await schedule()), [['B','13:00',0],['A','14:15',0],['C','14:45',0]]);
  assert((await schedule()).activities.every((a: Activity) => a.status === 'draft'));
});

test('archiving a draft closes its duration and restoration reserves it again', async () => {
  await resetSchedule();
  const a = await activity(alice, { title: 'A', start_time: '14:00', duration_minutes: 30 });
  await activity(admin, { title: 'B', start_time: '14:30', duration_minutes: 15 });
  let state = await schedule();
  const archived = await request(`/activities/${a.id}/archive`, 'POST', { revision: a.revision, schedule_revision: state.wedding.schedule_revision }, alice);
  assert.equal(archived.status, 200); assert.deepEqual(starts(await schedule()), [['B','14:00',0]]);
  state = await schedule();
  assert.equal((await request(`/activities/${a.id}/restore`, 'POST', { revision: archived.data.revision, schedule_revision: state.wedding.schedule_revision }, admin)).status, 200);
  assert.deepEqual(starts(await schedule()), [['A','14:00',0],['B','14:30',0]]);
});

test('cascades cross midnight; out-of-range changes roll back activity, times, revisions and offered jobs', async () => {
  await resetSchedule();
  const a = await activity(admin, { title: 'A', start_time: '23:30', duration_minutes: 15 });
  await activity(admin, { title: 'B', start_time: '23:45', duration_minutes: 15 });
  let state = await schedule();
  const addition = await request('/activities', 'POST', { title: 'Night contribution', duration_minutes: 30, schedule_revision: state.wedding.schedule_revision, placement: { mode: 'relative', anchor_id: a.id, position: 'after' } }, alice);
  assert.equal(addition.status, 200);
  assert.deepEqual(starts(await schedule()), [['A','23:30',0],['Night contribution','23:45',0],['B','00:15',1]]);
  await activity(admin, { title: 'Last', start_time: '23:40', day_offset: 365, duration_minutes: 15 });
  state = await schedule();
  const failed = await request('/activities', 'POST', { title: 'Too late', duration_minutes: 10, take_care: true, placement: { mode: 'relative', anchor_id: state.activities.find((a: Activity) => a.title === 'Last').id, position: 'before' }, schedule_revision: state.wedding.schedule_revision }, alice);
  assert.equal(failed.status, 409); assert.match(failed.data.error, /365 days/);
  const after = await schedule(); assert.deepEqual(after.activities, state.activities); assert.deepEqual(after.jobs, state.jobs); assert.equal(after.wedding.schedule_revision, state.wedding.schedule_revision);
  assert.equal((await updateTiming(a.id, { duration_minutes: 1441 })).status, 400);
});

test('guests need no credentials, keep ownership across reloads and cannot gain organiser powers', async () => {
  const joined = await request('/session/guest', 'POST', { organiser: true, role: 'organiser' });
  assert.equal(joined.status, 200); assert.equal(joined.data.participant.role, 'participant');
  assert.equal(joined.data.return_code, undefined);
  const guest = { id: joined.data.participant.id, csrf: joined.data.csrf, cookie: joined.headers.get('set-cookie')!.split(';')[0] };
  const repeat = await request('/session/guest', 'POST', {}, guest);
  assert.equal(repeat.data.participant.id, guest.id);
  assert.equal((await request('/timeline','GET',undefined,guest)).status,200);
  assert.equal((await request('/settings','PUT',{},guest)).status,403);
  assert.equal((await request('/export','GET',undefined,guest)).status,404);
  const name = await request('/session/name','POST',{ display_name:'Table helper', role:'organiser' },guest);
  assert.equal(name.data.participant.display_name,'Table helper'); assert.equal(name.data.participant.role,'participant');
  const a = await activity(guest, { title:'An anonymous contribution' });
  assert.equal(a.creator_id,guest.id); assert.equal(a.status,'draft');
  assert.equal((await request(`/activities/${a.id}/confirm`,'POST',{ revision:a.revision },guest)).status,403);
  assert.equal((await request('/session/guest','POST',{},undefined,randomUUID(),{Origin:'https://unrelated.invalid'})).status,403);
});

test('wedding start changes only the opening chain; fixed anchors and other days retain their clocks', async () => {
  await resetSchedule(); await database().query("UPDATE wedding SET start_time='14:00'");
  await activity(admin,{title:'Pickup',start_time:'09:00',day_offset:-3,duration_minutes:30,timing_mode:'fixed'});
  await activity(admin,{title:'Ceremony',start_time:'14:00',duration_minutes:30});
  await activity(admin,{title:'Photos',start_time:'14:30',duration_minutes:30});
  await activity(admin,{title:'Dinner',start_time:'18:00',duration_minutes:60,timing_mode:'fixed'});
  await activity(admin,{title:'Dancing',start_time:'19:00',duration_minutes:60});
  await activity(admin,{title:'Return tables',start_time:'10:00',day_offset:5,duration_minutes:30,timing_mode:'fixed'});
  const before=await schedule(), settings={...before.wedding,start_time:'15:00'};
  const moved=await request('/settings','PUT',settings,admin); assert.equal(moved.status,200,JSON.stringify(moved.data));
  assert.deepEqual(starts(await schedule()),[['Pickup','09:00',-3],['Ceremony','15:00',0],['Photos','15:30',0],['Dinner','18:00',0],['Dancing','19:00',0],['Return tables','10:00',5]]);
  assert.equal((await request('/settings','PUT',{...settings,start_time:'16:00'},admin)).status,409);
  const current=await schedule();
  const conflict=await request('/settings','PUT',{...current.wedding,start_time:'18:00'},admin);
  assert.equal(conflict.status,409); assert.match(conflict.data.error,/fixed start/);
  assert.deepEqual((await schedule()).activities,current.activities);
  assert.equal((await schedule()).wedding.start_time,'15:00:00');
});

test('fixed appointments preserve gaps, linked insertions stop at anchors, and multi-day tasks stay independent', async () => {
  await resetSchedule();
  const a=await activity(admin,{title:'Opening',start_time:'14:00',duration_minutes:30});
  const b=await activity(admin,{title:'Fixed appointment',start_time:'16:00',duration_minutes:30,timing_mode:'fixed'});
  await activity(admin,{title:'After appointment',start_time:'16:30',duration_minutes:30});
  const state=await schedule();
  const inserted=await request('/activities','POST',{title:'Welcome',duration_minutes:15,placement:{mode:'relative',anchor_id:a.id,position:'after'},schedule_revision:state.wedding.schedule_revision},alice);
  assert.equal(inserted.status,200);
  assert.deepEqual(starts(await schedule()),[['Opening','14:00',0],['Welcome','14:30',0],['Fixed appointment','16:00',0],['After appointment','16:30',0]]);
  const pickup=await activity(alice,{title:'Collect tables',start_time:'09:00',day_offset:-3,duration_minutes:45,timing_mode:'fixed'});
  await activity(alice,{title:'Return tables',start_time:'11:00',day_offset:5,duration_minutes:60,timing_mode:'fixed'});
  const current=await schedule();
  assert.equal((await request('/activities','POST',{title:'Load van',duration_minutes:15,placement:{mode:'relative',anchor_id:pickup.id,position:'after'},schedule_revision:current.wedding.schedule_revision},alice)).status,200);
  const after=await schedule(); assert.equal(after.activities.find((x:Activity)=>x.title==='Load van').plan_day,-3);
  assert.equal(after.activities.find((x:Activity)=>x.id===b.id).start_time,'16:00:00');
  assert.equal(after.activities.find((x:Activity)=>x.title==='Return tables').start_time,'11:00:00');
  assert.equal((await request('/activities','POST',{title:'Outside supported days',placement:{mode:'absolute',start_time:'09:00',day_offset:-366}},alice)).status,400);
});

test('access attempt throttling is persisted across requests', async () => {
  const make = () => handle(new Request('http://wedding.test/api/session/join', { method: 'POST', headers: { Origin: 'http://wedding.test', 'X-Wedding-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: 'Test', code: 'invalid', organiser: true }) }), 'rate-test');
  for (let i = 0; i < 30; i++) assert.equal((await make()).status, 401);
  assert.equal((await make()).status, 429);
});

test('group nominations are atomic, retry-safe and individually owned; concurrent groups cannot overfill', async () => {
  const a = await activity(), j = await job(a.id, alice, { capacity: 4 });
  await request(`/jobs/${j.id}/volunteer`, 'POST', {}, bob);
  const key = randomUUID(), payload = { nominee_names: [' One ', 'Two', 'Three'] };
  const [first, retry] = await Promise.all([request(`/jobs/${j.id}/nominate`,'POST',payload,alice,key), request(`/jobs/${j.id}/nominate`,'POST',payload,alice,key)]);
  assert.equal(first.status,200); assert.deepEqual(first.data,retry.data);
  assert.deepEqual(first.data.assignments.map((x: any) => x.nominee_name),['One','Two','Three']);
  const nominee = first.data.assignments[1];
  assert.equal((await request(`/assignments/${nominee.id}`,'PUT',{nominee_name:'Wrong',revision:1},bob)).status,403);
  assert.equal((await request(`/assignments/${nominee.id}`,'PUT',{nominee_name:'New two',revision:1},alice)).status,200);
  assert.equal((await request(`/assignments/${nominee.id}/withdraw`,'POST',{revision:2},alice)).status,200);
  const tooMany = await request(`/jobs/${j.id}/nominate`,'POST',{nominee_names:['Four','Five']},alice);
  assert.equal(tooMany.status,409); assert.match(tooMany.data.error,/No names were saved/);
  assert.equal((await database().query('SELECT count(*)::int AS count FROM assignments WHERE job_id=$1',[j.id])).rows[0].count,4);
  const racing = await job(a.id,alice,{capacity:3});
  const groups = await Promise.all([request(`/jobs/${racing.id}/nominate`,'POST',{nominee_names:['A','B']},alice), request(`/jobs/${racing.id}/nominate`,'POST',{nominee_names:['C','D']},bob)]);
  assert.deepEqual(groups.map(r=>r.status).sort(),[200,409]);
  assert.equal((await database().query('SELECT count(*)::int AS count FROM assignments WHERE job_id=$1',[racing.id])).rows[0].count,2);
  for (const names of [[],['   '],['x'.repeat(81)],Array(101).fill('Name')]) assert.equal((await request(`/jobs/${racing.id}/nominate`,'POST',{nominee_names:names},alice)).status,400);
});

test('formatted descriptions persist safely, derive plain text and preserve compatibility with older clients', async () => {
  const doc = { type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Welcome',marks:[{type:'bold'}]},{type:'text',text:' everyone',marks:[{type:'italic'}]}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Bring water'}]}]}]}] };
  const a = await activity(alice,{description:'Ignored plain text',description_content:doc,illustration:'waves'});
  assert.equal(a.description,'Welcome everyone\nBring water'); assert.deepEqual(a.description_content,doc);
  const state = await schedule(); assert.deepEqual(state.activities.find((x:Activity)=>x.id===a.id).description_content,doc);
  const retained = await request(`/activities/${a.id}`,'PUT',{...a,description_content:undefined,title:'New title',placement:{mode:'keep'}},alice);
  assert.equal(retained.status,200); assert.deepEqual(retained.data.description_content,doc);
  const changed = await request(`/activities/${a.id}`,'PUT',{...retained.data,description_content:undefined,description:'Older client text',placement:{mode:'keep'}},alice);
  assert.equal(changed.status,200); assert.equal(changed.data.description_content,null);
  for (const description_content of [
    {type:'doc',content:[{type:'image',attrs:{src:'javascript:alert(1)'}}]},
    {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Unsafe mark',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]},
    {type:'doc',content:[{type:'paragraph',attrs:{style:'color:red'},content:[{type:'text',text:'Attributes'}]}]},
    {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x'.repeat(1201)}]}]},
  ]) assert.equal((await request('/activities','POST',{title:'Invalid content',description_content},alice)).status,400);
  const literal = await activity(alice,{description:'<img src=x onerror=alert(1)>',illustration:'shell'});
  assert.equal(literal.description,'<img src=x onerror=alert(1)>'); assert.equal(literal.description_content,null);
});

test('all five themes persist for every visitor; only organisers change them and stale settings cannot overwrite', async () => {
  const before = await schedule();
  assert.equal((await request('/settings','PUT',{...before.wedding,theme:'night'},alice)).status,403);
  assert.equal((await request('/settings','PUT',{...before.wedding,theme:'not-a-theme'},admin)).status,400);
  for (const theme of ['beach','night','garden','sunset','lavender']) {
    const current = await schedule();
    const saved = await request('/settings','PUT',{...current.wedding,start_time:current.wedding.start_time.slice(0,5),theme},admin);
    assert.equal(saved.status,200); assert.equal((await request('/timeline','GET',undefined,bob)).data.wedding.theme,theme);
  }
  assert.equal((await request('/settings','PUT',{...before.wedding,start_time:before.wedding.start_time.slice(0,5),theme:'beach'},admin)).status,409);
  const current = await schedule();
  assert.equal(current.wedding.schedule_revision,before.wedding.schedule_revision); assert.deepEqual(current.activities,before.activities);
  const {theme,...legacy} = current.wedding;
  assert.equal((await request('/settings','PUT',{...legacy,start_time:legacy.start_time.slice(0,5)},admin)).data.theme,theme);
});
