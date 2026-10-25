import { sortActivities, type Activity } from './model';
export type Placement =
  | { mode: 'relative'; anchor_id: string; position: 'before' | 'after' }
  | { mode: 'absolute'; start_time: string; day_offset: number; plan_day?: number }
  | { mode: 'untimed'; day_offset?: number }
  | { mode: 'keep' };
export type SchedulePlan = { activities: Activity[]; error?: string };
export const durationChoices = [5, 10, 15, 30, 45, 60, 90, 120];
export function minutes(time: string, day = 0): number {
  return day * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
function clock(value: number) {
  if (!Number.isInteger(value) || value < -365 * 1440 || value >= 366 * 1440) throw new Error('These changes go beyond 365 days before or after the wedding. Choose another day or a shorter duration.');
  const day = Math.floor(value / 1440), local = value - day * 1440;
  return { time: `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`, day };
}
function at(a: Activity, start: number): Activity {
  const from = clock(start), to = clock(start + a.duration_minutes);
  return { ...a, start_time: from.time, day_offset: from.day, end_time: to.time, end_day_offset: to.day };
}
function shift(list: Activity[], from: number, delta: number, planDay: number) {
  let last: Activity | undefined;
  for (let i = from; i < list.length; i++) {
    const a = list[i];
    if (a.plan_day !== planDay) break;
    if (a.timing_mode === 'fixed') {
      if (delta > 0 && last?.end_time && a.start_time && minutes(last.end_time, last.end_day_offset) > minutes(a.start_time, a.day_offset))
        throw new Error(`The linked activities would run into ${a.title}, which has a fixed start. Shorten the duration or ask an organiser to adjust that appointment.`);
      break;
    }
    if (a.start_time && delta) { list[i] = at(a, minutes(a.start_time, a.day_offset) + delta); last = list[i]; }
  }
}
function ordered(list: Activity[]) {
  return [...list].sort((a, b) => a.plan_day - b.plan_day || Number(!a.start_time) - Number(!b.start_time)
    || (a.start_time && b.start_time ? minutes(a.start_time, a.day_offset) - minutes(b.start_time, b.day_offset) : 0)
    || a.sort_order - b.sort_order).map((a, i) => ({ ...a, sort_order: i + 1 }));
}
/** Fixed starts stop a chain. Each selected planning day is independent,
 * including its linked activities that cross midnight. */
export function planSchedule(existing: Activity[], activity: Activity, placement: Placement, operation: 'insert' | 'edit' | 'remove' = 'insert'): SchedulePlan {
  try {
    const list = sortActivities(existing).map(a => ({ ...a }));
    const originalIndex = list.findIndex(a => a.id === activity.id), old = list[originalIndex];
    if (operation === 'edit' && !old) throw new Error('This activity is no longer on the timeline. Refresh and review the current schedule.');
    if (!Number.isInteger(activity.duration_minutes) || activity.duration_minutes < 1 || activity.duration_minutes > 1440) throw new Error('Choose a duration between 1 and 1,440 minutes.');
    if (operation === 'edit' && placement.mode === 'keep') {
      list[originalIndex] = { ...activity };
      if (old.start_time) {
        list[originalIndex] = at(activity, minutes(old.start_time, old.day_offset));
        shift(list, originalIndex + 1, activity.duration_minutes - old.duration_minutes, old.plan_day);
      }
      return { activities: ordered(list) };
    }
    if (old) {
      list.splice(originalIndex, 1);
      if (old.start_time) shift(list, originalIndex, -old.duration_minutes, old.plan_day);
    }
    if (operation === 'remove') return { activities: ordered(list) };
    if (placement.mode === 'untimed') return { activities: ordered([...list, { ...activity, plan_day: placement.day_offset ?? 0, start_time: null, end_time: null, day_offset: placement.day_offset ?? 0, end_day_offset: placement.day_offset ?? 0 }]) };
    let index: number, start: number, planDay: number;
    if (placement.mode === 'relative') {
      index = list.findIndex(a => a.id === placement.anchor_id);
      if (index < 0 || !list[index].start_time) throw new Error('The activity you chose is no longer in the timed schedule. Choose another position.');
      const anchor = list[index]; planDay = anchor.plan_day;
      start = minutes(anchor.start_time!, anchor.day_offset);
      if (placement.position === 'after') { start += anchor.duration_minutes; index++; }
      else if (anchor.timing_mode === 'fixed') start -= activity.duration_minutes;
      activity = { ...activity, timing_mode: 'linked' };
    } else if (placement.mode === 'absolute') {
      planDay = placement.plan_day ?? placement.day_offset; start = minutes(placement.start_time, placement.day_offset);
      index = list.findIndex(a => a.plan_day > planDay || (a.plan_day === planDay && (!a.start_time || minutes(a.start_time, a.day_offset) >= start)));
      if (index < 0) index = list.length;
    } else throw new Error('Choose where this activity belongs.');
    const following = list[index], row = at({ ...activity, plan_day: planDay }, start);
    if (activity.timing_mode === 'linked') {
      if (following?.plan_day === planDay && following.timing_mode === 'fixed' && following.start_time && start + row.duration_minutes > minutes(following.start_time, following.day_offset))
        throw new Error(`There is not enough room before ${following.title}, which has a fixed start. Choose a shorter duration or another position.`);
      const overlap = following?.plan_day === planDay && following.start_time ? Math.max(0, start - minutes(following.start_time, following.day_offset)) : 0;
      shift(list, index, row.duration_minutes + overlap, planDay);
    }
    list.splice(index, 0, row);
    return { activities: ordered(list) };
  } catch (error) { return { activities: existing, error: (error as Error).message }; }
}
export function planWeddingStart(existing: Activity[], previous: string, next: string): SchedulePlan {
  try {
    const list = sortActivities(existing).map(a => ({ ...a }));
    const first = list.findIndex(a => a.plan_day === 0 && a.start_time);
    if (first >= 0) shift(list, first, minutes(next) - minutes(previous), 0);
    return { activities: ordered(list) };
  } catch (error) { return { activities: existing, error: (error as Error).message }; }
}
