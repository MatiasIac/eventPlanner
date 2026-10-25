import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Activity, Participant } from '../shared/model';
import { activitySchema, placementSchema } from '../shared/validation';
import { minutes, type Placement } from '../shared/schedule';
import type { Client } from './db';
import { owner, organiser } from './auth';
import { ApiError } from './errors';
import { reschedule, scheduleVersion } from './scheduling';

type Input = z.infer<typeof activitySchema>;
async function get(c: Client, id: string): Promise<Activity> {
  const row = (await c.query('SELECT * FROM activities WHERE id=$1', [z.uuid().parse(id)])).rows[0];
  if (!row) throw new ApiError(404, 'This activity could not be found.');
  return row;
}
function active(a: Activity) { if (a.archived) throw new ApiError(409, 'This activity has been archived. Refresh the timeline.', a); }
function revision(a: Activity, value: unknown) { if (a.revision !== value) throw new ApiError(409, 'Someone has changed this entry. Review the latest version before saving again.', a); }
function placement(data: Input, old?: Activity): Placement {
  if (data.placement) return data.placement;
  // Retain compatibility with absolute-clock clients; the timeline UI supplies
  // an explicit placement and the version of the running order it previews.
  if (old && data.start_time === old.start_time?.slice(0, 5) && data.day_offset === old.day_offset) return { mode: 'keep' };
  return data.start_time ? { mode: 'absolute', start_time: data.start_time, day_offset: data.day_offset } : old && !old.start_time ? { mode: 'keep' } : { mode: 'untimed' };
}
function duration(data: Input, old?: Activity) {
  const value = data.duration_minutes ?? (data.start_time && data.end_time ? minutes(data.end_time, data.end_day_offset) - minutes(data.start_time, data.day_offset) : old?.duration_minutes ?? 15);
  if (value < 1 || value > 1440) throw new ApiError(400, 'Choose a duration between 1 and 1,440 minutes.');
  return value;
}
export async function mutateActivity(c: Client, p: Participant, method: string, parts: string[], body: unknown) {
  if (parts.length === 1 && method === 'POST') {
    const data = activitySchema.parse(body), where = placement(data);
    if (where.mode === 'keep') throw new ApiError(400, 'Choose a position for the new activity.');
    await scheduleVersion(c, data.schedule_revision, where.mode === 'relative');
    if (data.confirm) organiser(p);
    if ((await c.query('SELECT count(*)::int AS count FROM activities')).rows[0].count >= 500) throw new ApiError(409, 'The activity limit has been reached. Please contact the organiser.');
    const a = (await c.query(`INSERT INTO activities(id,title,description,location_note,illustration,creator_id,duration_minutes,status,confirmed_by,confirmed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [randomUUID(),data.title,data.description,data.location_note,data.illustration,p.id,duration(data),data.confirm ? 'confirmed' : 'draft',data.confirm ? p.id : null,data.confirm ? new Date() : null])).rows[0] as Activity;
    await reschedule(c, { ...a, timing_mode: data.timing_mode ?? (where.mode === 'absolute' ? 'fixed' : 'linked') }, where, 'insert', a.id);
    if (data.take_care) {
      if ((await c.query('SELECT count(*)::int AS count FROM jobs')).rows[0].count >= 2500 || (await c.query('SELECT count(*)::int AS count FROM assignments')).rows[0].count >= 10000) throw new ApiError(409, 'The planning limit has been reached.');
      const jobId = randomUUID();
      await c.query('INSERT INTO jobs(id,activity_id,title,creator_id) VALUES($1,$2,$3,$4)', [jobId,a.id,data.responsibility_title,p.id]);
      await c.query('INSERT INTO assignments(id,job_id,participant_id,manager_id) VALUES($1,$2,$3,$3)', [randomUUID(),jobId,p.id]);
    }
    return get(c, a.id);
  }
  const a = await get(c, parts[1]);
  if (parts[2] === 'confirm' && method === 'POST') {
    organiser(p); active(a); revision(a, z.object({ revision: z.number().int().positive() }).parse(body).revision);
    if (a.status === 'confirmed') return a;
    return (await c.query("UPDATE activities SET status='confirmed',confirmed_by=$1,confirmed_at=now(),revision=revision+1,updated_at=now() WHERE id=$2 RETURNING *", [p.id,a.id])).rows[0];
  }
  if (parts[2] === 'move' && method === 'POST') {
    organiser(p); active(a);
    const data = z.object({ revision: z.number().int().positive(), schedule_revision: z.number().int().positive(), placement: placementSchema.optional(), direction: z.enum(['up','down']).optional() }).parse(body);
    revision(a, data.revision); await scheduleVersion(c, data.schedule_revision, true);
    let where = data.placement;
    if (!where && data.direction) {
      const list = (await c.query('SELECT * FROM activities WHERE NOT archived AND start_time IS NOT NULL AND plan_day=$1 ORDER BY sort_order,id', [a.plan_day])).rows as Activity[];
      const index = list.findIndex(x => x.id === a.id), other = list[index + (data.direction === 'up' ? -1 : 1)];
      if (!other) return { moved: false };
      where = { mode: 'relative', anchor_id: other.id, position: data.direction === 'up' ? 'before' : 'after' };
    }
    if (!where || where.mode !== 'relative' || where.anchor_id === a.id) throw new ApiError(400, 'Choose another activity to move before or after.');
    await reschedule(c, a, where, 'edit');
    return { moved: true, activity: await get(c, a.id) };
  }
  owner(p, a.creator_id);
  if (parts.length === 2 && method === 'PUT') {
    active(a); const data = activitySchema.parse(body); revision(a, data.revision);
    const where = placement(data, a), length = duration(data, a);
    const timingMode = where.mode === 'relative' ? 'linked' : data.timing_mode ?? a.timing_mode;
    const changesTiming = where.mode !== 'keep' || length !== a.duration_minutes || timingMode !== a.timing_mode;
    if (p.role !== 'organiser' && (where.mode !== 'keep' || timingMode !== a.timing_mode || (a.status === 'confirmed' && changesTiming))) throw new ApiError(403, 'Only organisers can move activities or change the timing of a confirmed activity.');
    if (data.confirm) organiser(p);
    if (changesTiming) await scheduleVersion(c, data.schedule_revision, true);
    await c.query(`UPDATE activities SET title=$1,description=$2,location_note=$3,illustration=$4,
      revision=revision+1,updated_at=now() WHERE id=$5`, [data.title,data.description,data.location_note,data.illustration,a.id]);
    if (changesTiming) await reschedule(c, { ...a, duration_minutes: length, duration_estimated: false, timing_mode: timingMode }, where, 'edit');
    if (data.duration_minutes !== undefined && !changesTiming && a.duration_estimated) await c.query('UPDATE activities SET duration_estimated=false WHERE id=$1', [a.id]);
    if (data.confirm && a.status !== 'confirmed') await c.query("UPDATE activities SET status='confirmed',confirmed_by=$1,confirmed_at=now() WHERE id=$2", [p.id,a.id]);
    return get(c, a.id);
  }
  if (parts.length === 3 && ['archive','restore'].includes(parts[2]) && method === 'POST') {
    const data = z.object({ revision: z.number().int().positive(), schedule_revision: z.number().int().positive().optional() }).parse(body);
    revision(a, data.revision); await scheduleVersion(c, data.schedule_revision);
    if (parts[2] === 'restore') {
      organiser(p);
      if (!a.archived) return a;
      await reschedule(c, a, a.start_time ? { mode: 'absolute', start_time: a.start_time.slice(0,5), day_offset: a.day_offset, plan_day: a.plan_day } : { mode: 'untimed', day_offset: a.plan_day }, 'insert', a.id);
    } else {
      if (a.archived) return a;
      if (p.role !== 'organiser') {
        const other = await c.query(`SELECT 1 FROM jobs j WHERE j.activity_id=$1 AND ((NOT j.archived AND j.creator_id<>$2)
          OR EXISTS(SELECT 1 FROM assignments s WHERE s.job_id=j.id AND s.active AND s.manager_id<>$2)) LIMIT 1`, [a.id,p.id]);
        if (other.rowCount) throw new ApiError(403, 'Other people are helping with this activity. Ask an organiser to archive it.');
      }
      await reschedule(c, a, { mode: 'keep' }, 'remove');
    }
    await c.query('UPDATE activities SET archived=$1,revision=revision+1,updated_at=now() WHERE id=$2', [parts[2] === 'archive',a.id]);
    return get(c, a.id);
  }
  throw new ApiError(404, 'This activity action could not be found.');
}
