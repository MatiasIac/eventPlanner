import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Activity, Assignment, Job, Participant, Timeline, Wedding } from '../shared/model';
import { activityTime, clockTime, dayLabel, dayDate } from '../shared/model';
import { api, ApiFailure, setCsrf } from './api';
import { ActivityPlanner, type TimelinePreview } from './ActivityPlanner';
import type { Placement } from '../shared/schedule';
import { ConfirmForm, ErrorNotice, Field, JobForm, SidePanel, NominationForm, SettingsForm, fieldA11y } from './components';

type Session = { participant: Participant; csrf: string; return_code?: string };
type Overlay =
  | { type: 'activity'; activity?: Activity; placement?: Placement }
  | { type: 'job'; activityId: string; job?: Job }
  | { type: 'nomination'; job: Job; assignment?: Assignment }
  | { type: 'confirm'; title: string; text: string; path: string; body: unknown }
  | { type: 'settings'; wedding: Wedding }
  | { type: 'account' | 'my-jobs' | 'archive' | 'participants' | 'login' };

function SignIn({ onSession }: { onSession: (session: Session) => void }) {
  const [recover, setRecover] = useState(false), [name, setName] = useState(''), [code, setCode] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState<ApiFailure | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return; setPending(true); setError(null);
    try { onSession(await api(recover ? '/session/recover' : '/session/join', { method: 'POST', body: recover ? { code: code.trim() } : { display_name: name, code: code.trim(), organiser: true } })); }
    catch(e) { setError(e as ApiFailure); } finally { setPending(false); }
  }
  return <form onSubmit={submit}><p className="form-intro">Organisers sign in to confirm activities and manage the schedule. Guests can use the timeline without signing in.</p><ErrorNotice error={error}/><fieldset disabled={pending}>
    {!recover && <Field name="display_name" label="Your display name"><input id="display_name" required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></Field>}
    <Field name="code" label={recover ? 'Personal return code' : 'Organiser credential'}><input id="code" type="password" required maxLength={256} value={code} onChange={e => setCode(e.target.value)}/></Field>
    <button className="primary wide" type="submit">{pending ? 'Opening...' : recover ? 'Restore my access' : 'Sign in as organiser'}</button>
    <button className="text-button" type="button" onClick={() => { setRecover(!recover); setCode(''); setError(null); }}>{recover ? 'Use organiser credential' : 'I have a personal return code'}</button>
  </fieldset></form>;
}
function GuestName({ participant, saved }: { participant: Participant; saved: (session: Session) => void }) {
  const [name, setName] = useState(participant.display_name === 'Guest' ? '' : participant.display_name);
  const [error, setError] = useState<ApiFailure | null>(null), [pending, setPending] = useState(false);
  return <form className="guest-name" onSubmit={async e => { e.preventDefault(); setPending(true); setError(null); try { saved(await api('/session/name', { method: 'POST', body: { display_name: name } })); } catch(e) { setError(e as ApiFailure); } finally { setPending(false); } }}>
    <p>Your browser remembers your contributions. Add a name so people know who is helping; no account or code is needed.</p><ErrorNotice error={error}/>
    <Field name="guest_name" label="Your name"><input id="guest_name" required maxLength={80} value={name} onChange={e => setName(e.target.value)}/></Field><button className="primary" disabled={pending}>Save name</button>
  </form>;
}
const pageFor = (day: number) => day < 0 ? 'before' : day > 0 ? 'after' : 'wedding';
type PlanningPage = 'before' | 'wedding' | 'after';

export function App() {
  const [session, setSession] = useState<Session | null>(null); const [booting, setBooting] = useState(true);
  const [data, setData] = useState<Timeline | null>(null); const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [preview, setPreview] = useState<TimelinePreview | null>(null);
  const [planningPage, setPlanningPage] = useState<PlanningPage>(() => ['before','after'].includes(location.hash.slice(1)) ? location.hash.slice(1) as PlanningPage : 'wedding');
  const bootstrap = useRef<Promise<Session> | null>(null);
  const showPreview = useCallback((next: TimelinePreview | null) => { setPreview(next); const activity = next?.activities.find(a => a.id === next.activityId); if (activity) { const nextPage = pageFor(activity.plan_day); setPlanningPage(nextPage); history.replaceState(null,'','#' + nextPage); } }, []);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef<{ id: string; revision: number; schedule_revision: number } | null>(null);
  const [returnCode, setReturnCode] = useState(''); const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState<ApiFailure | null>(null); const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState<string[]>([]); const [archive, setArchive] = useState<Timeline | null>(null);
  const requestPending = useRef(false); const attempts = useRef(new Map<string, string>()); const pendingActions = useRef(new Set<string>());
  const lastInteraction = useRef(Date.now());
  const me = session?.participant;
  const acceptSession = useCallback((result: Session) => { setCsrf(result.csrf); setSession(result); setData(null); if (result.return_code) { setReturnCode(result.return_code); setOverlay({ type: 'account' }); } }, []);
  useEffect(() => {
    let cancelled = false;
    bootstrap.current ??= api<Session>('/session').catch(e => { if (e.status === 401) return api<Session>('/session/guest', { method: 'POST', body: {} }); throw e; });
    bootstrap.current.then(result => { if (!cancelled) { setCsrf(result.csrf); setSession(result); } }).catch(e => { if (!cancelled) setLoadError(e.message); }).finally(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { const changed = () => setPlanningPage(['before','after'].includes(location.hash.slice(1)) ? location.hash.slice(1) as PlanningPage : 'wedding'); window.addEventListener('hashchange',changed); return () => window.removeEventListener('hashchange',changed); }, []);
  const refresh = useCallback(async () => {
    if (requestPending.current || !session) return;
    requestPending.current = true; setRefreshing(true);
    try { const result = await api<Timeline>('/timeline'); setData(result); setLoadError(''); }
    catch (e) { setLoadError((e as Error).message); }
    finally { requestPending.current = false; setRefreshing(false); }
  }, [session]);
  useEffect(() => {
    if (!session) return;
    void refresh();
    const active = () => document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastInteraction.current < 120000;
    const interaction = () => { const wasIdle = Date.now() - lastInteraction.current >= 120000; lastInteraction.current = Date.now(); if (wasIdle && active()) void refresh(); };
    const focus = () => { if (document.visibilityState === 'visible' && navigator.onLine) { lastInteraction.current = Date.now(); void refresh(); } };
    const connectivity = () => { setOnline(navigator.onLine); if (navigator.onLine) focus(); };
    const poll = window.setInterval(() => { if (active()) void refresh(); }, 30000);
    for (const event of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(event, interaction, { passive: true });
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    return () => { clearInterval(poll); for (const event of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(event, interaction); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); };
  }, [session, refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  const close = () => { setOverlay(null); setPreview(null); };
  const saved = (message = 'Saved') => { setNotice(message); setActionError(null); close(); void refresh(); };
  async function action(path: string, body: unknown = {}, success = 'Saved') {
    if (pendingActions.current.has(path)) return;
    pendingActions.current.add(path); setBusy([...pendingActions.current]); setActionError(null);
    const fingerprint = JSON.stringify({ path, body });
    if (!attempts.current.has(fingerprint)) attempts.current.set(fingerprint, crypto.randomUUID());
    try {
      const result = await api(path, { method: 'POST', body, key: attempts.current.get(fingerprint) });
      attempts.current.delete(fingerprint); setNotice(success); if (path !== '/session/logout') await refresh(); return result;
    } catch (e) { setActionError(e as ApiFailure); }
    finally { pendingActions.current.delete(path); setBusy([...pendingActions.current]); }
  }
  const nameOf = (id: string) => data?.participants.find(p => p.id === id)?.display_name ?? 'Participant';
  const assignmentName = (s: Assignment) => s.nominee_name ?? nameOf(s.participant_id!);
  const canEdit = (id: string) => me?.role === 'organiser' || me?.id === id;
  function archiveEntry(kind: 'activity' | 'job', entry: Activity | Job) {
    const jobs = kind === 'activity' ? data!.jobs.filter(j => j.activity_id === entry.id) : [entry as Job];
    const assignments = data!.assignments.filter(s => jobs.some(j => j.id === s.job_id));
    const helpers = assignments.length ? assignments.map(assignmentName).join(', ') : 'No helpers are currently assigned.';
    setOverlay({ type: 'confirm', title: `Archive ${kind}`, text: `“${entry.title}”${kind === 'activity' ? ` and its ${jobs.length} jobs` : ''} will disappear from the active timeline. Affected helpers: ${helpers} ${kind === 'activity' ? 'Following activities move earlier by its duration. ' : ''}All records are kept, and an organiser can restore this entry.`, path: `/${kind === 'activity' ? 'activities' : 'jobs'}/${entry.id}/archive`, body: { revision: entry.revision, ...(kind === 'activity' ? { schedule_revision: data!.wedding.schedule_revision } : {}) } });
  }
  async function openArchive() { setArchive(null); setOverlay({ type: 'archive' }); try { setArchive(await api<Timeline>('/archive')); } catch (e) { setActionError(e as ApiFailure); } }
  function renderJob(job: Job, expanded = false) {
    const assignments = data!.assignments.filter(s => s.job_id === job.id);
    const full = assignments.length >= job.capacity; const self = assignments.some(s => s.participant_id === me!.id);
    return <section key={job.id} className="job" aria-label={job.title}><div className="job-heading"><h4>{job.title}</h4><span className={`status ${full ? 'covered' : 'open'}`}>{assignments.length}/{job.capacity} {job.capacity === 1 ? 'helper' : 'helpers'} - {full ? 'Covered' : 'Open'}</span>{canEdit(job.creator_id) && <details className="entry-menu"><summary aria-label={`Manage ${job.title}`}>Manage</summary><div><button onClick={() => setOverlay({ type: 'job', activityId: job.activity_id, job })}>Edit job</button><button onClick={() => archiveEntry('job', job)}>Archive job</button></div></details>}</div>
      {job.instructions && <details className="instructions" open={expanded || undefined}><summary>Job instructions</summary><p>{job.instructions}</p></details>}
      {job.instructions && <p className="print-instructions">{job.instructions}</p>}
      {assignments.length > 0 && <ul className="helpers">{assignments.map(s => <li key={s.id}><div><span className="helper-name">{assignmentName(s)}{s.participant_id === me!.id && <small> · you</small>}</span>{s.nominee_name && <small className="nomination-note">Nominated by {s.manager_id === me!.id ? 'you' : nameOf(s.manager_id)}</small>}</div>{canEdit(s.manager_id) && <div className="assignment-actions">{s.nominee_name && <button className="text-button" onClick={() => setOverlay({ type: 'nomination', job, assignment: s })} aria-label={`Edit nomination for ${s.nominee_name}`}>Edit</button>}<button className="text-button" disabled={busy.includes(`/assignments/${s.id}/withdraw`)} onClick={() => void action(`/assignments/${s.id}/withdraw`, { revision: s.revision }, 'Assignment withdrawn')} aria-label={`Withdraw ${assignmentName(s)}`}>Withdraw</button></div>}</li>)}</ul>}
      <div className="job-actions">{!full && !self && <button className="help-button" disabled={busy.includes(`/jobs/${job.id}/volunteer`)} onClick={() => void action(`/jobs/${job.id}/volunteer`, {}, 'You’re on the list. Thank you!')}>{busy.includes(`/jobs/${job.id}/volunteer`) ? 'Saving…' : 'I can help'}</button>}{!full && <button className="text-button" onClick={() => setOverlay({ type: 'nomination', job })}>Nominate someone</button>}</div>
    </section>;
  }
  function addOnPage() {
    const last = data?.activities.filter(a => a.start_time && pageFor(a.plan_day) === planningPage).at(-1);
    if (last && planningPage === 'wedding') { insertAt(last,'after'); requestAnimationFrame(() => document.querySelector('[data-activity-id="' + last.id + '"]')?.scrollIntoView({ block: 'start' })); }
    else setOverlay({ type: 'activity', placement: { mode: 'absolute', start_time: planningPage === 'wedding' ? data?.wedding.start_time.slice(0,5) ?? '14:00' : '09:00', day_offset: planningPage === 'before' ? -1 : planningPage === 'after' ? 1 : 0 } });
  }
  function insertAt(activity: Activity, position: 'before' | 'after') {
    setOverlay({ type: 'activity', placement: { mode: 'relative', anchor_id: activity.id, position } });
  }
  function dropAt(event: React.DragEvent, target: Activity, position: 'before' | 'after') {
    event.preventDefault();
    const source = drag.current;
    drag.current = null; setDraggingId(null);
    if (me?.role !== 'organiser' || !source || source.id === target.id) return;
    void action(`/activities/${source.id}/move`, { revision: source.revision, schedule_revision: source.schedule_revision, placement: { mode: 'relative', anchor_id: target.id, position } }, 'Running order updated');
  }
  function dropZone(activity: Activity, position: 'before' | 'after') {
    return me?.role === 'organiser' && activity.start_time && <div className={`drop-zone ${draggingId && draggingId !== activity.id ? 'ready' : ''}`} data-drop-target={`${position}:${activity.id}`} aria-label={`Drop ${position} ${activity.title}`} onDragOver={event => { if (drag.current && drag.current.id !== activity.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => dropAt(event, activity, position)}><span>Move {position} {activity.title}</span></div>;
  }
  function renderActivity(activity: Activity, timed: boolean) {
    const isNew = Boolean(preview?.isNew && preview.activityId === activity.id);
    const source = data!.activities.find(a => a.id === activity.id) ?? activity;
    const shifted = !isNew && (source.start_time?.slice(0,5) !== activity.start_time?.slice(0,5) || source.day_offset !== activity.day_offset);
    const jobs = data!.jobs.filter(j => j.activity_id === activity.id);
    const group = data!.activities.filter(a => a.start_time && a.plan_day === activity.plan_day);
    const index = group.findIndex(a => a.id === activity.id);
    return <article key={activity.id} className={`timeline-entry ${timed ? '' : 'untimed-entry'} ${activity.status === 'draft' ? 'draft-entry' : ''} ${isNew ? 'preview-entry' : ''} ${draggingId === activity.id ? 'dragging' : ''}`} aria-label={activity.title} data-activity-id={activity.id}>
      {!isNew && dropZone(source, 'before')}
      {timed && <div className="time-badge"><span>{activity.day_offset !== 0 && <small>{dayLabel(activity.day_offset)}</small>}{activityTime({ ...activity, day_offset: 0, end_time: null })}{shifted && <small className="previous-time">Was {activityTime({ ...source, end_time: null })}</small>}</span></div>}
      <div className="activity-card"><div className="activity-picture"><img draggable={false} src={activity.image_id ? `/api/images/${activity.image_id}` : `/illustrations/${activity.illustration}.svg`} alt={activity.image_alt || `${activity.illustration === 'leaf' ? 'Leaf' : activity.illustration} illustration`} width={88} height={88} loading="lazy" onError={e => { const target = e.currentTarget; if (!target.src.endsWith('/illustrations/leaf.svg')) target.src = '/illustrations/leaf.svg'; }}/></div>
      <div className="activity-title"><div className="activity-state"><span className={`activity-status ${activity.status}`}>{isNew ? 'Unsaved preview' : activity.status === 'draft' ? 'Draft - awaiting organiser' : 'Confirmed'}</span>{preview?.activityId === activity.id && !isNew && <small>Unsaved changes</small>}</div><p className="entry-kicker">{activity.timing_mode === 'fixed' ? 'FIXED START - ' : ''}{activity.duration_minutes} MIN{activity.duration_estimated ? ' - ESTIMATED' : ''}{activity.end_time ? ` - Until ${(activity.end_day_offset !== activity.day_offset ? dayLabel(activity.end_day_offset) + ' - ' : '') + clockTime(activity.end_time)}` : ''}</p><h3>{activity.title}</h3></div>
      <div className="activity-body">{activity.description && <p className="description">{activity.description}</p>}{activity.location_note && <p className="location-note">{activity.location_note}</p>}
        {isNew ? <p className="preview-help">Choose the time needed in the panel. Save to share this draft.</p> : <>
          <div className="entry-meta"><span>Added by {nameOf(activity.creator_id)}</span>{canEdit(activity.creator_id) && <><button className="text-button" onClick={() => setOverlay({ type: 'activity', activity: source })}>Edit activity</button><button className="text-button" onClick={() => archiveEntry('activity', source)}>Archive</button></>}
            {me!.role === 'organiser' && source.status === 'draft' && <button className="confirm-activity" disabled={busy.includes(`/activities/${source.id}/confirm`)} onClick={() => void action(`/activities/${source.id}/confirm`, { revision: source.revision }, 'Activity confirmed')}>Confirm activity</button>}
          </div>
          {me!.role === 'organiser' && <div className="order-controls"><button className="drag-handle" draggable={!preview} disabled={Boolean(preview)} aria-label={`Drag ${activity.title} to reorder`} onClick={() => setOverlay({ type: 'activity', activity: source })} onDragStart={event => { drag.current = { id: source.id, revision: source.revision, schedule_revision: data!.wedding.schedule_revision }; setDraggingId(source.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', source.id); }} onDragEnd={() => { drag.current = null; setDraggingId(null); }}>Move</button>{timed && <><button className="text-button" disabled={index === 0 || Boolean(preview) || busy.includes(`/activities/${source.id}/move`)} onClick={() => void action(`/activities/${source.id}/move`, { direction: 'up', revision: source.revision, schedule_revision: data!.wedding.schedule_revision }, 'Running order updated')}>Move up</button><button className="text-button" disabled={index === group.length - 1 || Boolean(preview) || busy.includes(`/activities/${source.id}/move`)} onClick={() => void action(`/activities/${source.id}/move`, { direction: 'down', revision: source.revision, schedule_revision: data!.wedding.schedule_revision }, 'Running order updated')}>Move down</button></>}</div>}
          {timed && <button className="text-button insert-before" disabled={Boolean(preview)} aria-label={`Add activity before ${activity.title}`} onClick={() => insertAt(source, 'before')}>+ Add before</button>}
          {jobs.length > 0 && <div className="job-list"><p className="jobs-label">HELPING HANDS</p>{jobs.map(j => renderJob(j))}</div>}<button className="text-button add-job" onClick={() => setOverlay({ type: 'job', activityId: activity.id })}>＋ Add a job</button>
        </>}
      </div></div>
      {!isNew && <>{dropZone(source, 'after')}<div className="between"><button className="text-button" data-insert-point disabled={Boolean(preview)} aria-label={`Add activity after ${activity.title}`} onClick={() => timed ? insertAt(source, 'after') : setOverlay({ type: 'activity', placement: { mode: 'untimed', day_offset: activity.plan_day } })}>+ Add activity</button></div></>}
    </article>;
  }
  if (booting) return <main className="loading" role="status">Opening our wedding day…</main>;
  if (!session) return <main className="loading"><p role="alert">{loadError || 'Could not open the timeline.'}</p><button onClick={() => location.reload()}>Try again</button></main>;
  const visibleActivities = (preview?.activities ?? data?.activities ?? []).filter(a => pageFor(a.plan_day) === planningPage);
  const timed = visibleActivities.filter(a => a.start_time); const untimed = visibleActivities.filter(a => !a.start_time);
  const draftCount = data?.activities.filter(a => a.status === 'draft' && pageFor(a.plan_day) === planningPage).length ?? 0;
  const myAssignments = data?.assignments.filter(s => s.manager_id === me!.id) ?? [];
  const myActivities = data?.activities.filter(a => data.jobs.some(j => j.activity_id === a.id && myAssignments.some(s => s.job_id === j.id))) ?? [];
  const overlayTitle = overlay?.type === 'activity' ? overlay.activity ? 'Edit activity' : 'Add an activity' : overlay?.type === 'job' ? overlay.job ? 'Edit job' : 'Add a helping hand' : overlay?.type === 'nomination' ? overlay.assignment ? 'Edit nomination' : 'Nominate someone' : overlay?.type === 'settings' ? 'Wedding settings' : overlay?.type === 'confirm' ? overlay.title : overlay?.type === 'my-jobs' ? 'My jobs' : overlay?.type === 'login' ? 'Organiser sign in' : overlay?.type === 'account' ? 'Your name & contributions' : overlay?.type === 'archive' ? 'Archived entries' : 'Participant access';
  return <div className={`app-shell ${overlay ? 'has-panel' : ''}`}><a className="skip-link" href="#timeline">Skip to timeline</a><header className="site-header"><div className="identity"><img src="/illustrations/leaf.svg" width={40} height={40} alt=""/><div><p className="eyebrow">OUR WEDDING DAY</p><h1>{data?.wedding.title ?? 'Matías & Lisa'}</h1></div></div><nav aria-label="Timeline actions"><button className="primary" onClick={addOnPage}>＋ Add activity</button><button onClick={() => setOverlay({ type: 'my-jobs' })}>My jobs{myAssignments.length ? <span className="count">{myAssignments.length}</span> : null}</button><button className="quiet refresh" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button><details className="main-menu"><summary aria-label="More options">•••</summary><div className="menu-panel"><span>Here as {me!.display_name}</span><button onClick={() => { close(); setTimeout(() => window.print(), 0); }}>Print timeline</button><button onClick={() => setOverlay({ type: 'account' })}>Your name & contributions</button>{me!.role !== 'organiser' && <button onClick={() => setOverlay({ type: 'login' })}>Organiser sign in</button>}{me!.role === 'organiser' && <><button onClick={() => data && setOverlay({ type: 'settings', wedding: data.wedding })}>Wedding settings</button><button onClick={() => void openArchive()}>Archived entries</button><button onClick={() => setOverlay({ type: 'participants' })}>Participant access</button><a href="/api/export" download>Export schedule (JSON)</a></>}{me!.role === 'organiser' && <button onClick={async () => { const result = await action('/session/logout'); if (result) { setReturnCode(''); close(); setCsrf(''); const guest = await api<Session>('/session/guest', { method: 'POST', body: {} }); acceptSession(guest); } }}>Sign out</button>}</div></details></nav></header>
    <main id="timeline"><nav className="day-pages" aria-label="Planning pages">{(['before','wedding','after'] as const).map(page => <a key={page} href={page === 'wedding' ? '#wedding' : '#' + page} aria-current={planningPage === page ? 'page' : undefined} onClick={() => setPlanningPage(page)}>{page === 'before' ? 'Before' : page === 'after' ? 'After' : 'Wedding day'}</a>)}</nav><div className="schedule-heading"><div><p className="eyebrow">THE RUNNING ORDER</p><h2>{planningPage === 'before' ? 'Before the wedding.' : planningPage === 'after' ? 'After the wedding.' : 'A day, together.'}</h2><p className="wedding-details">{data?.wedding.date ? new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${data.wedding.date}T12:00:00`)) : 'Date to be confirmed'}<span>·</span>{data?.wedding.venue || 'Venue to be confirmed'}</p>{planningPage === 'wedding' && data && <div className="wedding-start"><span>Wedding starts at <strong>{clockTime(data.wedding.start_time)}</strong></span>{me!.role === 'organiser' && <button className="text-button" onClick={() => setOverlay({ type: 'settings', wedding: data.wedding })}>Change start time</button>}</div>}{planningPage !== 'wedding' && <p className="page-context">{planningPage === 'before' ? 'Preparations, pickups and plans in the days leading up to the wedding.' : 'Returns, collections and anything to finish in the days afterwards.'}</p>}</div><div className="freshness"><span className={`connection-dot ${loadError || !online ? 'disconnected' : ''}`}/>{!online ? 'Offline · showing last saved timeline' : loadError ? 'Could not refresh · timeline may be out of date' : data ? `Updated ${new Date(data.fetched_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}` : 'Loading the timeline…'}<small>All times in {data?.wedding.timezone ?? 'Pacific/Auckland'}</small>{me!.role !== 'organiser' && <button className="text-button" onClick={() => setOverlay({ type: 'account' })}>{me!.display_name === 'Guest' ? 'Add your name (optional)' : me!.display_name}</button>}</div></div>
    {(draftCount > 0 || preview) && <aside className="planning-note">{preview ? <strong>Previewing unsaved changes. </strong> : <strong>{draftCount} {draftCount === 1 ? 'draft activity' : 'draft activities'} awaiting confirmation. </strong>}Planning times include drafts. Organisers can confirm them or archive them to remove their time.</aside>}
    {loadError && <div className="error" role="alert">{loadError} {data && 'The last loaded timeline is still shown.'}<button className="text-button" onClick={() => void refresh()}>Try refresh again</button></div>}
    <ErrorNotice error={actionError}/><div className="save-status" role="status" aria-live="polite">{notice}</div>
    {!data && !loadError && <div className="loading" role="status">Gathering the plans…</div>}
    {data && !visibleActivities.length && <section className="empty-state"><img src="/illustrations/flowers.svg" width={88} height={88} alt="A small bouquet"/><h3>Every good day starts somewhere.</h3><p>Add the first moment, then invite everyone to lend a hand.<br/>It’s fine if the time is still to be confirmed.</p><button className="primary" data-insert-point onClick={addOnPage}>Add your first activity</button></section>}
    {timed.length > 0 && <section className="timeline" aria-label="Wedding day timeline">{timed.map((a,i) => <Fragment key={a.id}>{(i === 0 || a.plan_day !== timed[i-1].plan_day) && planningPage !== 'wedding' && <h3 className="planning-day-heading">{dayLabel(a.plan_day)}<small>{dayDate(data!.wedding.date,a.plan_day)}</small></h3>}{renderActivity(a,true)}</Fragment>)}</section>}
    {untimed.length > 0 && <section className="unconfirmed" aria-labelledby="unconfirmed-title"><div className="unconfirmed-heading"><p className="eyebrow">STILL FINDING A PLACE</p><h2 id="unconfirmed-title">Time to be confirmed</h2><p>Good ideas, with a little room to work out the details.</p></div>{untimed.map(a => renderActivity(a, false))}</section>}
    {data && <footer className="page-footer"><span className="footer-leaf" aria-hidden="true">❧</span><p>Made of little moments. Made possible together.</p></footer>}
    </main>
    {overlay && <SidePanel title={overlayTitle} close={close}>
      {overlay.type === 'login' && <SignIn onSession={acceptSession}/>}
      {overlay.type === 'activity' && data && <ActivityPlanner key={overlay.activity?.id ?? JSON.stringify(overlay.placement ?? 'new')} activity={overlay.activity} timeline={data} participantId={me!.id} isOrganiser={me!.role === 'organiser'} initialPlacement={overlay.placement} onPreview={showPreview} onTimeline={setData} onSaved={saved} cancel={close}/>}
      {overlay.type === 'job' && <JobForm activityId={overlay.activityId} job={overlay.job} latest={data?.jobs.find(j => j.id === overlay.job?.id)} onSaved={saved} cancel={close}/>}
      {overlay.type === 'nomination' && <NominationForm job={overlay.job} assignment={overlay.assignment} onSaved={saved} cancel={close}/>}
      {overlay.type === 'settings' && <SettingsForm activities={data?.activities ?? []} wedding={overlay.wedding} latest={data?.wedding ?? overlay.wedding} onSaved={saved} cancel={close}/>}
      {overlay.type === 'confirm' && <ConfirmForm text={overlay.text} path={overlay.path} body={overlay.body} onSaved={saved} cancel={close}/>}
      {overlay.type === 'account' && <div className="account-content"><GuestName participant={me!} saved={result => { setSession(result); setNotice('Name saved'); close(); void refresh(); }}/><p>Contributing as <strong>{me!.display_name}</strong>{me!.role === 'organiser' ? ' · Organiser' : ''}.</p><p>Your personal return code restores this identity, your contributions and your jobs in another browser. Keep it private. It is optional; your current browser already remembers you.</p>{returnCode ? <div className="return-code"><label htmlFor="return-code">Save your personal return code somewhere private</label><textarea id="return-code" readOnly value={returnCode} onFocus={e => e.target.select()} rows={2}/><p>This code is shown only when generated. It will disappear when this page is reloaded.</p></div> : <p>Your existing personal return code is hidden. If you have lost it, generate a replacement.</p>}<ErrorNotice error={actionError}/><button disabled={busy.includes('/session/return-code')} onClick={async () => { const result = await action('/session/return-code', {}, 'New return code generated'); if (result) setReturnCode(result.return_code); }}>Generate a new return code</button><small>Generating a new code makes your previous personal code stop working.</small><div className="form-actions"><button className="primary" onClick={close}>Done</button></div></div>}
      {overlay.type === 'my-jobs' && <div className="my-jobs"><p className="form-intro">Your helping hands, including people you have nominated.</p>{!myActivities.length && <p>You haven’t signed up for anything yet. Choose “I can help” or nominate someone on the timeline.</p>}{myActivities.map(a => <section key={a.id}><p className="my-job-time">{activityTime(a)}</p><h3>{a.title}</h3>{data!.jobs.filter(j => j.activity_id === a.id && myAssignments.some(s => s.job_id === j.id)).map(j => renderJob(j, true))}</section>)}<button className="primary wide" onClick={close}>Back to the timeline</button></div>}
      {overlay.type === 'archive' && <><p className="form-intro">Restore an activity first, then any separately archived jobs. Withdrawn assignments stay withdrawn.</p><ErrorNotice error={actionError}/>{!archive ? <p>Loading archived entries…</p> : <div className="admin-list">{!archive.activities.some(a => a.archived) && !archive.jobs.some(j => j.archived) && <p>No archived entries.</p>}{archive.activities.filter(a => a.archived).map(a => <div key={a.id}><span><strong>{a.title}</strong><small>Activity · jobs and retained helpers will reappear</small></span><button onClick={() => setOverlay({ type: 'confirm', title: 'Restore activity', text: `Restore “${a.title}” and its retained jobs and assignments? Independently archived jobs stay archived.`, path: `/activities/${a.id}/restore`, body: { revision: a.revision, schedule_revision: data!.wedding.schedule_revision } })}>Restore</button></div>)}{archive.jobs.filter(j => j.archived).map(j => <div key={j.id}><span><strong>{j.title}</strong><small>Job · {archive.activities.find(a => a.id === j.activity_id)?.title}</small></span><button disabled={archive.activities.some(a => a.id === j.activity_id && a.archived)} onClick={() => setOverlay({ type: 'confirm', title: 'Restore job', text: `Restore “${j.title}” with its retained helpers?`, path: `/jobs/${j.id}/restore`, body: { revision: j.revision } })}>Restore</button></div>)}</div>}</>}
      {overlay.type === 'participants' && <><p className="form-intro">Revocation ends this identity’s sessions and personal return code. Their contributions and assignments remain. A new browser can contribute as a new guest identity.</p><div className="admin-list">{data?.participants.map(p => <div key={p.id}><span><strong>{p.display_name}</strong><small>{p.role} · ID {p.id.slice(0, 8)}{p.revoked ? ' · Revoked' : ''}</small></span>{!p.revoked && p.id !== me!.id && <button onClick={() => setOverlay({ type: 'confirm', title: 'Revoke participant access', text: `End all sessions and disable the personal return code for ${p.display_name} (ID ${p.id.slice(0, 8)})? Contributions and assignments will be kept.`, path: `/participants/${p.id}/revoke`, body: {} })}>Revoke</button>}</div>)}</div></>}
    </SidePanel>}
  </div>;
}
