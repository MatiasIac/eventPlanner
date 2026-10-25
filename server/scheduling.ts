import type { Client } from './db';
import type { Activity } from '../shared/model';
import { ApiError } from './errors';
import { planSchedule, planWeddingStart, type Placement, type SchedulePlan } from '../shared/schedule';

export async function scheduleVersion(c: Client, expected: number | undefined, required = false) {
  const row = (await c.query('SELECT schedule_revision FROM wedding WHERE id=1')).rows[0];
  if ((required && expected === undefined) || (expected !== undefined && expected !== row.schedule_revision))
    throw new ApiError(409, 'The running order has changed. Review the latest timeline before applying these timing changes.', { schedule_revision: row.schedule_revision });
}
export async function reschedule(c: Client, activity: Activity, placement: Placement, operation: 'insert' | 'edit' | 'remove', excludeId?: string) {
  const existing = (await c.query('SELECT * FROM activities WHERE NOT archived ORDER BY sort_order,id')).rows.filter(a => a.id !== excludeId) as Activity[];
  const plan = planSchedule(existing, activity, placement, operation);
  await persistPlan(c, plan, excludeId);
}
export async function changeWeddingStart(c: Client, previous: string, next: string) {
  const existing = (await c.query('SELECT * FROM activities WHERE NOT archived ORDER BY sort_order,id')).rows as Activity[];
  await persistPlan(c, planWeddingStart(existing, previous, next));
}
async function persistPlan(c: Client, plan: SchedulePlan, excludeId?: string) {
  if (plan.error) throw new ApiError(409, plan.error);
  for (const a of plan.activities) {
    await c.query(`UPDATE activities SET start_time=$1,day_offset=$2,end_time=$3,end_day_offset=$4,sort_order=$5,
      duration_minutes=$6,duration_estimated=$7,plan_day=$10,timing_mode=$11,revision=revision+CASE WHEN id=$9::uuid THEN 0 ELSE 1 END,updated_at=now() WHERE id=$8
      AND (start_time,day_offset,end_time,end_day_offset,sort_order,duration_minutes,duration_estimated,plan_day,timing_mode)
      IS DISTINCT FROM ($1::time,$2::smallint,$3::time,$4::smallint,$5::bigint,$6::integer,$7::boolean,$10::smallint,$11::text)`,
      [a.start_time,a.day_offset,a.end_time,a.end_day_offset,a.sort_order,a.duration_minutes,a.duration_estimated,a.id,excludeId ?? null,a.plan_day,a.timing_mode]);
  }
  await c.query('UPDATE wedding SET schedule_revision=schedule_revision+1,updated_at=now() WHERE id=1');
}
