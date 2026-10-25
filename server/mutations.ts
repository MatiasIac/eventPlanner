import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Client } from './db';
import type { Participant } from '../shared/model';
import { jobSchema, nominationSchema, nominationsSchema, revisionSchema, settingsSchema } from '../shared/validation';
import { ApiError } from './errors';
import { owner, organiser } from './auth';
import { mutateActivity } from './activities';
import { changeWeddingStart, scheduleVersion } from './scheduling';

type Row = Record<string, any>;
async function record(c: Client, table: 'activities' | 'jobs' | 'assignments', id: string): Promise<Row> {
  z.uuid().parse(id);
  const r = await c.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  if (!r.rowCount) throw new ApiError(404, 'This entry could not be found.');
  return r.rows[0];
}
function revision(row: Row, value: unknown) { if (row.revision !== value) throw new ApiError(409, 'Someone has changed this entry. Review the latest version before saving again.', row); }
function active(row: Row) { if (row.archived) throw new ApiError(409, 'This entry has been archived. Refresh to see the current schedule.', row); }
async function jobAndParent(c: Client, id: string, allowArchived = false) {
  const job = await record(c, 'jobs', id); const activity = await record(c, 'activities', job.activity_id);
  if (!allowArchived) { active(activity); active(job); }
  return { job, activity };
}
async function bound(c: Client, table: 'activities' | 'jobs' | 'assignments', limit: number) {
  const r = await c.query(`SELECT count(*)::int AS count FROM ${table}`);
  if (r.rows[0].count >= limit) throw new ApiError(409, 'This planner has reached its planning limit. Please contact the organiser.');
}
async function assignment(c: Client, job: Row, p: Participant, name: string | null) {
  if (name === null) {
    const existing = await c.query('SELECT * FROM assignments WHERE job_id=$1 AND participant_id=$2 AND active', [job.id, p.id]);
    if (existing.rowCount) return existing.rows[0];
  }
  const current = (await c.query('SELECT * FROM assignments WHERE job_id=$1 AND active', [job.id])).rows;
  if (current.length >= job.capacity) throw new ApiError(409, 'That last place has already been taken. This job is covered.', { ...job, assignments: current });
  await bound(c, 'assignments', 10000);
  return (await c.query('INSERT INTO assignments(id,job_id,participant_id,nominee_name,manager_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(), job.id, name === null ? p.id : null, name, p.id])).rows[0];
}
export async function mutate(c: Client, p: Participant, method: string, path: string, body: unknown): Promise<unknown> {
  const parts = path.split('/').filter(Boolean);
  if (path === '/settings' && method === 'PUT') {
    organiser(p); const data = settingsSchema.parse(body);
    const row = (await c.query('SELECT * FROM wedding WHERE id=1')).rows[0]; revision(row, data.revision);
    const start = data.start_time ?? row.start_time.slice(0,5);
    if (start !== row.start_time.slice(0,5)) {
      await scheduleVersion(c, data.schedule_revision, true);
      await changeWeddingStart(c, row.start_time, start);
    }
    return (await c.query('UPDATE wedding SET title=$1,date=$2,venue=$3,start_time=$4,theme=$5,revision=revision+1,updated_at=now() WHERE id=1 RETURNING *', [data.title, data.date, data.venue,start,data.theme ?? row.theme])).rows[0];
  }
  if (parts[0] === 'activities') {
    if (parts[1] && parts[2] === 'jobs') {
      const a = await record(c, 'activities', parts[1]);
    if (parts[2] === 'jobs' && parts.length === 3 && method === 'POST') {
      active(a); const data = jobSchema.parse(body); await bound(c, 'jobs', 2500);
      const job = (await c.query('INSERT INTO jobs(id,activity_id,title,instructions,capacity,creator_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(), a.id, data.title, data.instructions, data.capacity, p.id])).rows[0];
      if (data.take_care) await assignment(c, job, p, null);
      return job;
    }
    }
    return mutateActivity(c, p, method, parts, body);
  }
  if (parts[0] === 'jobs' && parts[1]) {
    const { job: j, activity: a } = await jobAndParent(c, parts[1], true);
    if (parts.length === 3 && ['volunteer', 'nominate'].includes(parts[2]) && method === 'POST') {
      active(a); active(j);
      if (parts[2] === 'nominate' && body && typeof body === 'object' && 'nominee_names' in body) {
        const { nominee_names } = nominationsSchema.parse(body);
        const current = (await c.query('SELECT * FROM assignments WHERE job_id=$1 AND active', [j.id])).rows;
        const available = Math.max(0, j.capacity - current.length);
        if (nominee_names.length > available) throw new ApiError(409, `Only ${available} ${available === 1 ? 'place is' : 'places are'} available. No names were saved. Review the names and try again.`, { ...j, assignments: current });
        // The outer transaction holds the planner lock. Any failure rolls back
        // the entire group; request idempotency also covers the entire group.
        const saved = [];
        for (const name of nominee_names) saved.push(await assignment(c, j, p, name));
        return { assignments: saved };
      }
      const name = parts[2] === 'nominate' ? nominationSchema.parse(body).nominee_name : null;
      return assignment(c, j, p, name);
    }
    owner(p, j.creator_id);
    if (parts.length === 2 && method === 'PUT') {
      active(a); active(j); const data = jobSchema.parse(body); revision(j, data.revision);
      const count = (await c.query('SELECT count(*)::int AS count FROM assignments WHERE job_id=$1 AND active', [j.id])).rows[0].count;
      if (data.capacity < count) throw new ApiError(409, `There are already ${count} helpers. Withdraw assignments before reducing places.`, j);
      return (await c.query('UPDATE jobs SET title=$1,instructions=$2,capacity=$3,revision=revision+1,updated_at=now() WHERE id=$4 RETURNING *', [data.title, data.instructions, data.capacity, j.id])).rows[0];
    }
    if (parts.length === 3 && ['archive', 'restore'].includes(parts[2]) && method === 'POST') {
      revision(j, revisionSchema.parse(body).revision);
      if (parts[2] === 'restore') { organiser(p); active(a); }
      else if (p.role !== 'organiser') {
        const other = await c.query('SELECT 1 FROM assignments WHERE job_id=$1 AND active AND manager_id<>$2 LIMIT 1', [j.id, p.id]);
        if (other.rowCount) throw new ApiError(403, 'Other people are helping with this job. Ask an organiser to archive it.');
      }
      return (await c.query('UPDATE jobs SET archived=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *', [parts[2] === 'archive', j.id])).rows[0];
    }
  }
  if (parts[0] === 'assignments' && parts[1]) {
    const s = await record(c, 'assignments', parts[1]); owner(p, s.manager_id);
    if (parts.length === 2 && method === 'PUT') {
      await jobAndParent(c, s.job_id); const data = nominationSchema.parse(body); revision(s, data.revision);
      if (!s.active || s.participant_id) throw new ApiError(400, 'Only active on-behalf nominations can be renamed.');
      return (await c.query('UPDATE assignments SET nominee_name=$1,revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *', [data.nominee_name, s.id])).rows[0];
    }
    if (parts[2] === 'withdraw' && parts.length === 3 && method === 'POST') {
      revision(s, revisionSchema.parse(body).revision);
      return (await c.query('UPDATE assignments SET active=false,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *', [s.id])).rows[0];
    }
  }
  throw new ApiError(404, 'This action could not be found.');
}
