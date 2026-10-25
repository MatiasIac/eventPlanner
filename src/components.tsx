import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiFailure } from './api';
import type { Activity, Assignment, Job, Wedding } from '../shared/model';
import { planWeddingStart } from '../shared/schedule';

export function SidePanel({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const [minimised, setMinimised] = useState(false);
  const previousFocus = useRef(document.activeElement as HTMLElement);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) closeRef.current(); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); previousFocus.current?.focus({ preventScroll: true }); };
  }, []);
  return <aside className={`side-panel ${minimised ? 'minimised' : ''}`} role="dialog" aria-modal="false" aria-labelledby="panel-title">
    <div className="panel-heading"><h2 id="panel-title">{title}</h2><button className="panel-minimise" type="button" onClick={() => setMinimised(!minimised)} aria-label={minimised ? 'Expand panel' : 'Minimise panel'}>{minimised ? '↑' : '↓'}</button><button className="icon-button" type="button" aria-label="Close panel" onClick={close}>×</button></div>
    <div className="panel-content" hidden={minimised}>{children}</div>
  </aside>;
}
export function ErrorNotice({ error }: { error: ApiFailure | null }) { return error ? <div className="error" role="alert"><strong>Could not save.</strong> {error.message}{error.fields && Object.keys(error.fields).length > 0 && <ul>{Object.entries(error.fields).map(([key, value]) => <li key={key}>{key.replaceAll('_', ' ')}: {value}</li>)}</ul>}</div> : null; }
export function Field({ name, label, error, children, hint }: { name: string; label: string; error?: ApiFailure | null; children: ReactNode; hint?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label>{children}{hint && <small id={`${name}-hint`}>{hint}</small>}{error?.fields[name] && <small className="field-error" id={`${name}-error`}>{error.fields[name]}</small>}</div>;
}
export const fieldA11y = (name: string, error: ApiFailure | null) => ({ 'aria-invalid': Boolean(error?.fields[name]), 'aria-describedby': error?.fields[name] ? `${name}-error` : undefined });
export function useSave(onSaved: (message?: string) => void) {
  const [pending, setPending] = useState(false); const [error, setError] = useState<ApiFailure | null>(null);
  const pendingRef = useRef(false); const attempt = useRef({ fingerprint: '', key: '' });
  async function save(path: string, method: string, body: unknown, before?: () => Promise<unknown>) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(null);
    try {
      const prepared = before ? await before() : body;
      const fingerprint = JSON.stringify({ path, method, body: prepared });
      if (attempt.current.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
      await api(path, { method, body: prepared, key: attempt.current.key }); onSaved('Saved');
    } catch (e) { setError(e instanceof ApiFailure ? e : new ApiFailure('Please check your information and try again.')); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return { pending, error, setError, save };
}
export function FormActions({ pending, cancel, label = 'Save' }: { pending: boolean; cancel: () => void; label?: string }) { return <div className="form-actions"><button type="button" className="quiet" onClick={cancel} disabled={pending}>Cancel</button><button className="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : label}</button></div>; }
export function Conflict({ current, changed, load }: { current?: any; changed: boolean; load: () => void }) {
  return changed || current ? <div className="conflict" role="status"><strong>This entry has changed.</strong><p>Your draft is still here. Review the current version before saving.</p>{current && <div className="new-version"><strong>{current.title ?? current.nominee_name}</strong><p>{current.description ?? current.instructions}</p>{current.start_time && <small>Start: {current.start_time} · {current.day_offset ? 'Next day' : 'Main day'}</small>}</div>}<button type="button" onClick={load}>Replace my draft with latest version</button></div> : null;
}
export function JobForm({ activityId, job, latest, onSaved, cancel }: { activityId: string; job?: Job; latest?: Job; onSaved: (message?: string) => void; cancel: () => void }) {
  const [draft, setDraft] = useState({ title: '', instructions: '', capacity: 1, take_care: false, revision: job?.revision, ...job });
  const { pending, error, setError, save } = useSave(onSaved);
  const current = error?.current ?? latest;
  return <form onSubmit={e => { e.preventDefault(); void save(job ? `/jobs/${job.id}` : `/activities/${activityId}/jobs`, job ? 'PUT' : 'POST', draft); }}><p className="form-intro">A small way someone can help make the day happen.</p><Conflict changed={Boolean(latest && latest.revision !== draft.revision)} current={latest?.revision !== draft.revision || error?.current ? current : undefined} load={() => { if (current) setDraft({ ...draft, ...current }); setError(null); }}/><ErrorNotice error={error}/><fieldset disabled={pending}>
    <Field name="title" label="Job title" error={error}><input id="title" required maxLength={120} autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} {...fieldA11y('title', error)} placeholder="For example, carry the rings"/></Field>
    <Field name="capacity" label="Number of helpers" error={error}><input id="capacity" type="number" min={1} max={100} required value={draft.capacity || ''} onChange={e => setDraft({ ...draft, capacity: Number(e.target.value) })} {...fieldA11y('capacity', error)}/></Field>
    <Field name="instructions" label="Helpful instructions (optional)" error={error}><textarea id="instructions" rows={3} maxLength={1200} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} {...fieldA11y('instructions', error)}/></Field>
    {!job && <label className="check offer"><input type="checkbox" checked={draft.take_care} onChange={e => setDraft({ ...draft, take_care: e.target.checked })}/>I’ll do this <small>— save this job with me as a helper</small></label>}
  </fieldset><FormActions pending={pending} cancel={cancel}/></form>;
}
export function NominationForm({ job, assignment, onSaved, cancel }: { job: Job; assignment?: Assignment; onSaved: (message?: string) => void; cancel: () => void }) {
  const [name, setName] = useState(assignment?.nominee_name ?? ''); const [revision, setRevision] = useState(assignment?.revision);
  const { pending, error, setError, save } = useSave(onSaved);
  return <form onSubmit={e => { e.preventDefault(); void save(assignment ? `/assignments/${assignment.id}` : `/jobs/${job.id}/nominate`, assignment ? 'PUT' : 'POST', { nominee_name: name, revision }); }}><p className="form-intro">Nominate someone for <strong>{job.title}</strong>. Their name will appear on the timeline. You can change or withdraw this nomination.</p><ErrorNotice error={error}/>{error?.current && <Conflict changed current={error.current} load={() => { setName(error.current.nominee_name); setRevision(error.current.revision); setError(null); }}/>}<fieldset disabled={pending}><Field name="nominee_name" label="Their display name" error={error}><input id="nominee_name" autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} {...fieldA11y('nominee_name', error)}/></Field></fieldset><FormActions pending={pending} cancel={cancel}/></form>;
}
export function SettingsForm({ wedding, latest, activities, onSaved, cancel }: { wedding: Wedding; latest: Wedding; activities: Activity[]; onSaved: (message?: string) => void; cancel: () => void }) {
  const [draft, setDraft] = useState({ ...wedding, start_time: wedding.start_time.slice(0,5) }); const { pending, error, setError, save } = useSave(onSaved);
  const changesStart = draft.start_time !== latest.start_time.slice(0,5);
  const plan = planWeddingStart(activities, latest.start_time, draft.start_time);
  const count = plan.activities.filter(a => activities.some(old => old.id === a.id && (old.start_time?.slice(0,5) !== a.start_time?.slice(0,5) || old.day_offset !== a.day_offset))).length;
  const changed = latest.revision !== draft.revision || (changesStart && latest.schedule_revision !== draft.schedule_revision);
  return <form onSubmit={e => { e.preventDefault(); if (plan.error) { setError(new ApiFailure(plan.error)); return; } void save('/settings', 'PUT', draft); }}><p className="form-intro">Changing the start time moves its opening chain of activities. Fixed appointments and the Before and After pages stay in place.</p><ErrorNotice error={error}/><Conflict changed={changed} current={changed ? latest : undefined} load={() => { setDraft({ ...latest, start_time: latest.start_time.slice(0,5) }); setError(null); }}/><fieldset disabled={pending}>
    <Field name="wedding_start" label="Start time" error={error}><input id="wedding_start" type="time" required value={draft.start_time} onChange={e => setDraft({ ...draft, start_time: e.target.value })}/></Field>
    {changesStart && <div className="timing-preview" role="status">{plan.error ?? `${count} linked ${count === 1 ? 'activity will' : 'activities will'} move. Fixed start times stay unchanged.`}</div>}
    <Field name="title" label="Title" error={error}><input id="title" required maxLength={120} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} {...fieldA11y('title', error)}/></Field>
    <Field name="date" label="Date (optional)" error={error}><input id="date" type="date" value={draft.date ?? ''} onChange={e => setDraft({ ...draft, date: e.target.value || null })} {...fieldA11y('date', error)}/></Field>
    <Field name="venue" label="Venue (optional)" error={error}><input id="venue" maxLength={240} value={draft.venue} onChange={e => setDraft({ ...draft, venue: e.target.value })} {...fieldA11y('venue', error)}/></Field>
  </fieldset><FormActions pending={pending} cancel={cancel}/></form>;
}
export function ConfirmForm({ text, path, body, onSaved, cancel }: { text: string; path: string; body: unknown; onSaved: (message?: string) => void; cancel: () => void }) {
  const { pending, error, save } = useSave(onSaved);
  return <form onSubmit={e => { e.preventDefault(); void save(path, 'POST', body); }}><p>{text}</p><ErrorNotice error={error}/><FormActions pending={pending} cancel={cancel}/></form>;
}
