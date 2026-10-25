import { randomUUID } from 'node:crypto';
import { database, localMode, transaction } from '../server/db';
import { minutes } from '../shared/schedule';
if (!(localMode() || process.env.NETLIFY_DEV === 'true') || process.env.CONTEXT === 'production') throw new Error('Demo seed is limited to local development.');
await transaction(async c => {
  if ((await c.query('SELECT 1 FROM activities LIMIT 1')).rowCount) throw new Error('Seed refused: the schedule already has entries. No records were changed.');
  const id = randomUUID();
  await c.query("INSERT INTO participants(id,display_name,role,revoked) VALUES($1,'Demonstration','participant',true)", [id]);
  const examples = [
    ['Ceremony', 'An example of the moment it all begins. Add the details that will help everyone feel ready.', '14:00', 'rings', ['Carry the rings', 'Flower girl', 'Play the entrance music']],
    ['Congratulations & photographs', 'Time to gather together and capture a few memories. Confirm the photo groups when you are ready.', '14:45', 'photographs', ['Gather photo groups', 'Collect ceremony items']],
    ['Drinks & mingling', 'A little space to catch up, share a drink and enjoy being together.', '16:00', 'drinks', ['Bring ice', 'Help with refreshments']],
    ['The meal', 'Gather around the table. The menu and seating details can be added later.', '18:00', 'food', ['Help guests find their seats']],
    ['Speeches', 'A few words from the people closest to us. The order is still to be decided.', '19:30', 'speeches', ['Coordinate speakers', 'Handle the microphone']],
    ['Evening party', 'Music, good company and one more dance. Add transport plans when they are confirmed.', '20:00', 'music', ['Help with music', 'Coordinate rides', 'Help pack up']],
  ] as const;
  for (const [index, [title, description, time, illustration, jobs]] of examples.entries()) {
    const activityId = randomUUID();
    const length = examples[index + 1] ? minutes(examples[index + 1][2]) - minutes(time) : 60;
    await c.query("INSERT INTO activities(id,title,description,start_time,illustration,creator_id,duration_minutes,sort_order,duration_estimated,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,'draft')", [activityId, title, description, time, illustration, id, length, index + 1]);
    for (const job of jobs) await c.query('INSERT INTO jobs(id,activity_id,title,creator_id) VALUES($1,$2,$3,$4)', [randomUUID(), activityId, job, id]);
  }
  await c.query('UPDATE wedding SET demonstration=true WHERE id=1');
});
console.log('Demonstration content added. All times and activities are illustrative.');
await database().end();
