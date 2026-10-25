import type { Client } from './db';
import type { Timeline } from '../shared/model';
import { sortActivities } from '../shared/model';
export async function timeline(client: Client, includeArchived = false): Promise<Timeline> {
  const stored = (await client.query('SELECT * FROM wedding WHERE id=1')).rows[0];
  const { timezone, ...wedding } = stored;
  const activities = (await client.query(`SELECT * FROM activities ${includeArchived ? '' : 'WHERE NOT archived'} ORDER BY day_offset,start_time,sort_order LIMIT 500`)).rows.map(({ image_id, image_alt, ...a }) => a);
  const jobs = (await client.query(`SELECT j.* FROM jobs j JOIN activities a ON a.id=j.activity_id ${includeArchived ? '' : 'WHERE NOT j.archived AND NOT a.archived'} ORDER BY j.created_at,j.id LIMIT 2500`)).rows;
  const assignments = (await client.query(`SELECT s.* FROM assignments s JOIN jobs j ON j.id=s.job_id JOIN activities a ON a.id=j.activity_id ${includeArchived ? '' : 'WHERE s.active AND NOT j.archived AND NOT a.archived'} ORDER BY s.created_at,s.id LIMIT 10000`)).rows;
  const participants = (await client.query('SELECT id,display_name,role,revoked FROM participants ORDER BY created_at LIMIT 2000')).rows;
  return { wedding, activities: sortActivities(activities), jobs, assignments, participants, fetched_at: new Date().toISOString() };
}
