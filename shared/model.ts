export type Participant = { id: string; display_name: string; role: 'participant' | 'organiser'; revoked?: boolean };
export type Wedding = { id: number; title: string; date: string | null; venue: string; start_time: string; revision: number; schedule_revision: number; demonstration: boolean };
export type Activity = {
  id: string; title: string; description: string; start_time: string | null; day_offset: number;
  end_time: string | null; end_day_offset: number; location_note: string;
  illustration: string; 
  sort_order: number; creator_id: string; revision: number; archived: boolean;
  duration_minutes: number; duration_estimated: boolean; status: 'draft' | 'confirmed';
  confirmed_by: string | null; confirmed_at: string | null;
  timing_mode: 'linked' | 'fixed'; plan_day: number;
};
export type Job = { id: string; activity_id: string; title: string; instructions: string; capacity: number; creator_id: string; revision: number; archived: boolean };
export type Assignment = { id: string; job_id: string; participant_id: string | null; nominee_name: string | null; manager_id: string; active: boolean; revision: number };
export type Timeline = { wedding: Wedding; activities: Activity[]; jobs: Job[]; assignments: Assignment[]; participants: Participant[]; fetched_at: string };
export const illustrations = ['rings', 'flowers', 'photographs', 'drinks', 'food', 'speeches', 'cake', 'music', 'transport', 'leaf'] as const;
export function clockTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`;
}
export function activityTime(a: Activity): string {
  const prefix = a.day_offset ? `${dayLabel(a.day_offset)} · ` : '';
  if (!a.start_time) return `${a.plan_day ? `${dayLabel(a.plan_day)} · ` : ''}Time to be confirmed`;
  return `${prefix}${clockTime(a.start_time)}${a.end_time ? ` – ${a.end_day_offset !== a.day_offset ? `${dayLabel(a.end_day_offset)} · ` : ''}${clockTime(a.end_time)}` : ''}`;
}
export function dayLabel(day: number): string { return day === 0 ? 'Main day' : day < 0 ? `${Math.abs(day)} ${day === -1 ? 'day' : 'days'} before` : `${day} ${day === 1 ? 'day' : 'days'} after`; }
export function dayDate(date: string | null, offset: number): string {
  if (!date) return '';
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + offset);
  return new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(value);
}
export function sortActivities(list: Activity[]): Activity[] {
  return [...list].sort((a, b) => a.plan_day - b.plan_day || Number(!a.start_time) - Number(!b.start_time) || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}
