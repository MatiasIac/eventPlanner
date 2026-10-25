import { z } from 'zod';
import { illustrations } from './model';
const title = z.string().trim().min(1, 'Please enter a title.').max(120);
const paragraph = z.string().trim().max(1200).default('');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid local time.').nullable().default(null);
export const revisionSchema = z.object({ revision: z.number().int().positive() });
export const placementSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('relative'), anchor_id: z.uuid(), position: z.enum(['before', 'after']) }),
  z.object({ mode: z.literal('absolute'), start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), day_offset: z.number().int().min(-365).max(365) }),
  z.object({ mode: z.literal('untimed'), day_offset: z.number().int().min(-365).max(365).default(0) }), z.object({ mode: z.literal('keep') }),
]);
export const activitySchema = z.object({
  title, description: paragraph, start_time: time, day_offset: z.number().int().min(-365).max(365).default(0),
  end_time: time, end_day_offset: z.number().int().min(-365).max(365).default(0),
  location_note: z.string().trim().max(240).default(''), illustration: z.enum(illustrations).default('leaf'),
  take_care: z.boolean().default(false), responsibility_title: title.default('Take care of this activity'),
  revision: z.number().int().positive().optional(),
  timing_mode: z.enum(['linked','fixed']).optional(),
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  placement: placementSchema.optional(), schedule_revision: z.number().int().positive().optional(),
  confirm: z.boolean().default(false),
}).superRefine((a, ctx) => {
  const minutes = (t: string, d: number) => d * 1440 + Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (a.end_time && (!a.start_time || minutes(a.end_time, a.end_day_offset) <= minutes(a.start_time, a.day_offset)))
    ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'The end must be after the start, including its day.' });
});
export const jobSchema = z.object({ title, instructions: paragraph, capacity: z.number().int().min(1).max(100), take_care: z.boolean().default(false), revision: z.number().int().positive().optional() });
export const nominationSchema = z.object({ nominee_name: z.string().trim().min(1).max(80), revision: z.number().int().positive().optional() });
export const joinSchema = z.object({ display_name: z.string().trim().min(1).max(80), code: z.string().min(1).max(256), organiser: z.boolean().default(false) });
export const settingsSchema = z.object({
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  schedule_revision: z.number().int().positive().optional(),
  title, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid date.').nullable(),
  venue: z.string().trim().max(240), 
  revision: z.number().int().positive(),
});
