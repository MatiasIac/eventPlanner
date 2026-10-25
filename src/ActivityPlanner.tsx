import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Activity, Timeline } from '../shared/model';
import { activityTime, illustrations } from '../shared/model';
import { durationChoices, planSchedule, type Placement } from '../shared/schedule';
import { api, ApiFailure } from './api';
import { Conflict, ErrorNotice, Field, FormActions, fieldA11y, useSave } from './components';
import { DayPicker } from './DayPicker';

export type TimelinePreview = { activities: Activity[]; activityId: string; isNew: boolean };
export type ActivityPlannerProps = {
  activity?: Activity; timeline: Timeline; participantId: string; isOrganiser: boolean;
  initialPlacement?: Placement; onPreview: (preview: TimelinePreview | null) => void;
  onTimeline: (timeline: Timeline) => void;
  onSaved: (message?: string) => void; cancel: () => void;
};
export function ActivityPlanner({ activity, timeline, participantId, isOrganiser, initialPlacement, onPreview, onTimeline, onSaved, cancel }: ActivityPlannerProps) {
  const [id] = useState(() => activity?.id ?? crypto.randomUUID());
  const [snapshot, setSnapshot] = useState(timeline.activities);
  const [version, setVersion] = useState(timeline.wedding.schedule_revision);
  const [where, setWhere] = useState<Placement>(initialPlacement ?? (activity ? { mode: 'keep' } : { mode: 'untimed' }));
  const [clock, setClock] = useState(activity?.start_time?.slice(0,5) ?? (initialPlacement?.mode === 'absolute' ? initialPlacement.start_time : timeline.wedding.start_time.slice(0,5)));
  const [day, setDay] = useState(activity?.plan_day ?? (initialPlacement?.mode === 'absolute' || initialPlacement?.mode === 'untimed' ? initialPlacement.day_offset ?? 0 : timeline.activities.find(a => initialPlacement?.mode === 'relative' && a.id === initialPlacement.anchor_id)?.plan_day ?? 0));
  const [draft, setDraft] = useState({
    title: activity?.title ?? '', description: activity?.description ?? '', duration_minutes: activity?.duration_minutes ?? 15,
    location_note: activity?.location_note ?? '', illustration: activity?.illustration ?? 'leaf',
    take_care: false, responsibility_title: 'Take care of this activity', confirm: false, revision: activity?.revision,
    timing_mode: activity?.timing_mode ?? (initialPlacement?.mode === 'absolute' && initialPlacement.day_offset !== 0 ? 'fixed' : 'linked') as 'fixed' | 'linked',
  });
  const [reviewing, setReviewing] = useState(false);
  const { pending, error, setError, save } = useSave(onSaved);
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft(d => ({ ...d, [key]: value }));
  const latest: Activity | undefined = error?.current && activity && error.current.id === activity.id ? error.current : timeline.activities.find(a => a.id === activity?.id);
  const timingChanged = !activity || where.mode !== 'keep' || draft.duration_minutes !== activity.duration_minutes || draft.timing_mode !== activity.timing_mode;
  const scheduleChanged = timingChanged && timeline.wedding.schedule_revision !== version;
  const canChangeDuration = !activity || isOrganiser || (latest ?? activity).status === 'draft';
  const candidates = snapshot.filter(a => a.start_time && a.id !== activity?.id);
  const effectivePlacement = useMemo<Placement>(() => where.mode === 'absolute' ? { mode: 'absolute', start_time: clock, day_offset: day } : where.mode === 'untimed' ? { mode: 'untimed', day_offset: day } : where, [where, clock, day]);
  const plan = useMemo(() => {
    const baseline = snapshot.find(a => a.id === activity?.id) ?? activity;
    const row: Activity = {
      id, title: draft.title || 'New activity', description: draft.description, duration_minutes: draft.duration_minutes,
      duration_estimated: false, start_time: null, end_time: null, day_offset: 0, end_day_offset: 0,
      timing_mode: draft.timing_mode, plan_day: baseline?.plan_day ?? day,
      sort_order: 0, creator_id: participantId, revision: draft.revision ?? 1, archived: false,
      status: draft.confirm ? 'confirmed' : baseline?.status ?? 'draft', confirmed_at: null, confirmed_by: null,
      location_note: draft.location_note, illustration: draft.illustration,
      ...(baseline ? { start_time: baseline.start_time, end_time: baseline.end_time, day_offset: baseline.day_offset, end_day_offset: baseline.end_day_offset } : {}),
    };
    return planSchedule(snapshot, row, effectivePlacement, activity ? 'edit' : 'insert');
  }, [snapshot, draft, effectivePlacement, id, participantId, activity, day]);
  useEffect(() => { onPreview(plan.error ? null : { activities: plan.activities, activityId: id, isNew: !activity }); }, [plan, onPreview, id, activity]);
  useEffect(() => () => onPreview(null), [onPreview]);
  const proposed = plan.activities.find(a => a.id === id);
  const shifted = plan.activities.filter(a => a.id !== id && snapshot.some(before => before.id === a.id && (before.start_time?.slice(0,5) !== a.start_time?.slice(0,5) || before.day_offset !== a.day_offset)));
  const recordChanged = Boolean(activity && latest && latest.revision !== draft.revision);
  async function reviewSchedule() {
    setReviewing(true);
    try {
      const current = await api<Timeline>('/timeline');
      onTimeline(current); setSnapshot(current.activities); setVersion(current.wedding.schedule_revision); setError(null);
      return current;
    } catch (e) { setError(e as ApiFailure); }
    finally { setReviewing(false); }
  }
  async function loadCurrent() {
    const current = await reviewSchedule(), row = current?.activities.find(a => a.id === activity?.id);
    if (!row) return;
    setDraft({ ...draft, ...row, confirm: false }); setClock(row.start_time?.slice(0,5) ?? timeline.wedding.start_time.slice(0,5)); setDay(row.plan_day);
    setWhere({ mode: 'keep' });
  }
  function changeMode(mode: string) {
    if (mode === 'before' || mode === 'after') { update('timing_mode', 'linked'); setWhere({ mode: 'relative', anchor_id: where.mode === 'relative' ? where.anchor_id : candidates[0]?.id ?? '', position: mode }); }
    else if (mode === 'absolute') { update('timing_mode', 'fixed'); setWhere({ mode: 'absolute', start_time: clock, day_offset: day }); }
    else setWhere({ mode: mode as 'keep' | 'untimed' });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await save(activity ? `/activities/${activity.id}` : '/activities', activity ? 'PUT' : 'POST', draft, async () => {
      if (plan.error) throw new ApiFailure(plan.error);
      if (scheduleChanged) throw new ApiFailure('Review the latest running order before saving. Your text is still here.');
      return { title: draft.title, description: draft.description, duration_minutes: draft.duration_minutes,
        location_note: draft.location_note, illustration: draft.illustration,
        take_care: draft.take_care, responsibility_title: draft.responsibility_title, confirm: draft.confirm,
        revision: draft.revision, timing_mode: draft.timing_mode, placement: effectivePlacement, schedule_revision: version };
    });
  }
  return <form onSubmit={submit} className="activity-planner">
    <p className="form-intro">Keep the running order in view while you plan. The timeline shows your changes before you save.</p>
    {recordChanged && <Conflict changed current={latest} load={loadCurrent}/>}
    {(scheduleChanged || error?.current?.schedule_revision) && <div className="conflict" role="status"><strong>The running order has changed.</strong><p>Your text is preserved. Review the latest times and position before saving.</p><button type="button" onClick={reviewSchedule}>Review latest running order</button></div>}
    <ErrorNotice error={error}/>
    <fieldset disabled={pending || reviewing}>
      <Field name="title" label="Activity title" error={error}><input id="title" required maxLength={120} autoFocus value={draft.title} onChange={e => update('title', e.target.value)} {...fieldA11y('title', error)} placeholder="For example, a group photograph"/></Field>
      {(!activity || isOrganiser) && <>
        <Field name="placement_mode" label="Place in the timeline"><select id="placement_mode" value={where.mode === 'relative' ? where.position : where.mode} onChange={e => changeMode(e.target.value)}>
          {activity && <option value="keep">Keep this position</option>}
          {candidates.length > 0 && <><option value="before">Before an activity</option><option value="after">After an activity</option></>}
          <option value="absolute">Start at a particular time</option><option value="untimed">Time to be confirmed</option>
        </select></Field>
        {where.mode === 'relative' && <Field name="anchor_id" label={where.position === 'before' ? 'Before' : 'After'}><select id="anchor_id" value={where.anchor_id} onChange={e => setWhere({ ...where, anchor_id: e.target.value })}>{candidates.map(a => <option key={a.id} value={a.id}>{a.title} · {activityTime({ ...a, end_time: null })}</option>)}</select></Field>}
        {(where.mode === 'absolute' || where.mode === 'untimed') && <DayPicker value={day} onChange={setDay} date={timeline.wedding.date}/>}
        {(where.mode === 'absolute' || (where.mode === 'keep' && activity?.start_time)) && <>
          <Field name="start_time" label="Start time"><input id="start_time" type="time" required value={clock} onChange={e => { setClock(e.target.value); if (where.mode === 'keep') { setWhere({ mode: 'absolute', start_time: e.target.value, day_offset: day }); update('timing_mode','fixed'); } }}/></Field>
          <Field name="timing_mode" label="Scheduling"><select id="timing_mode" value={draft.timing_mode} onChange={e => update('timing_mode', e.target.value as 'fixed' | 'linked')}><option value="fixed">Keep this start time fixed</option><option value="linked">Move with the running order</option></select></Field>
        </>}
      </>}
      <Field name="duration_minutes" label="Time needed (minutes)" error={error} hint={activity?.duration_estimated ? 'This existing duration was estimated from the previous schedule. Adjust it as needed.' : undefined}>
        <div className="duration-choices" role="group" aria-label="Quick durations">{durationChoices.map(value => <button type="button" key={value} aria-pressed={draft.duration_minutes === value} disabled={!canChangeDuration} onClick={() => update('duration_minutes', value)}>{value} min</button>)}</div>
        <input id="duration_minutes" type="number" min={1} max={1440} required disabled={!canChangeDuration} value={draft.duration_minutes || ''} onChange={e => update('duration_minutes', Number(e.target.value))} {...fieldA11y('duration_minutes', error)}/>
      </Field>
      {activity && !isOrganiser && <small className="timing-permission">Organisers can move activities{activity.status === 'confirmed' ? ' and change confirmed times' : ''}.</small>}
      <div className={`timing-preview ${plan.error ? 'invalid' : ''}`} aria-live="polite">
        <strong>{plan.error ?? (proposed ? activityTime(proposed) : 'Choose a position')}</strong>
        {!plan.error && <p>{shifted.length ? `${shifted.length} following ${shifted.length === 1 ? 'activity changes' : 'activities change'} time. The preview shows the new running order.` : 'No other activity times change.'}</p>}
        <small>Linked activities move together. Fixed starts and other planning days stay in place.</small>
      </div>
      <Field name="description" label="A few helpful details" error={error}><textarea id="description" rows={3} maxLength={1200} value={draft.description} onChange={e => update('description', e.target.value)} {...fieldA11y('description', error)}/></Field>
      <Field name="location_note" label="Location note (optional)"><input id="location_note" maxLength={240} value={draft.location_note} onChange={e => update('location_note', e.target.value)}/></Field>
      <Field name="illustration" label="Icon"><select id="illustration" value={draft.illustration} onChange={e => update('illustration', e.target.value)}>{illustrations.map(x => <option key={x} value={x}>{x === 'leaf' ? 'Simple leaf' : x[0].toUpperCase() + x.slice(1)}</option>)}</select></Field>
      {!activity && <div className="offer"><label className="check"><input type="checkbox" checked={draft.take_care} onChange={e => update('take_care', e.target.checked)}/>I’ll take care of this</label>{draft.take_care && <><p>This creates a one-person job with you assigned, as part of the same save.</p><Field name="responsibility_title" label="Your job"><input id="responsibility_title" required maxLength={120} value={draft.responsibility_title} onChange={e => update('responsibility_title', e.target.value)}/></Field></>}</div>}
      {(!activity || activity.status === 'draft') && <div className="draft-explanation">{isOrganiser ? <label className="check"><input type="checkbox" checked={draft.confirm} onChange={e => update('confirm', e.target.checked)}/>Confirm this activity when saving</label> : <p>This will appear as a draft, with the proposed times, until an organiser confirms it.</p>}</div>}
    </fieldset>
    <FormActions pending={pending || reviewing} cancel={cancel} label={!activity && !draft.confirm ? 'Save draft' : draft.confirm ? 'Save & confirm' : 'Save'}/>
  </form>;
}
