# Collaborative planner requirements

Version 1.3 - 25 October 2026

This is the current implementation brief. The owner's follow-ups replace the original event branding, guest-login, account-recovery, image-upload and export requirements. Keep the application small and straightforward.

## Purpose and scope

One shared, persistent timeline for a group to plan activities and volunteer for jobs. Use React, TypeScript and Vite, a small Netlify Functions backend and PostgreSQL through Netlify Database. The same saved schedule must appear across browsers and devices. Use New Zealand English.

Guests enter immediately, without logging in, entering an access code or supplying a name. Only organisers authenticate. An automatic browser session remembers contributions; a name is optional. No registration, social login, personal return code or participant administration is needed.

## Interface

- Use the configured **Title** as the sole main heading and browser title, without a suffix or separator. No fixed slogan, event branding or demonstration banner.
- Settings contains **Title**, **Date (optional)**, **Venue (optional)** and **Start time**. No timezone control.
- Keep a compact header with Add activity, My jobs, refresh, optional name editing and a small menu. Retain Print timeline, organiser sign-in, Settings, Archived entries and organiser sign-out as appropriate. Remove My access, return codes, participant access and JSON export.
- Show no Last updated or All times in text. Errors and offline status remain visible when needed.
- Use a normally scrolling, centred vertical timeline with small bundled icons, time badges over the line, short descriptions and compact helping-hand cards. Do not build a large hero, dashboard, canvas, chat system or additional account tools.
- Activity edit and archive controls are icons with accessible labels. Job management, nomination editing and withdrawal controls are icons in the top-right area of the job card. Keep title, helper capacity, status and assigned names visible.
- Only the first activity has **Add before**, on the timeline outside the card. Use **Add activity** between entries and after the last entry.
- Activity creation/editing opens a non-modal panel beside the timeline. Keep the schedule visible and scrollable so people can compare times while editing. On phones use a collapsible bottom panel.
- Provide explicit Save and Cancel, pending and saved states, and an unsaved timing preview. Preserve draft text after errors and background updates.
- Provide Before, Main day and After pages. Before/After can contain activities several days away, with exact day counts and calendar dates when configured.

## Scheduling

Activity fields: title (required, maximum 120 characters), description (maximum 1,200), optional location note (maximum 240), bundled icon, duration, optional start time, planning day, creator, revision and draft/confirmed state. Do not provide image upload or alternate-text editing. Use the existing bundled icon set, with a quiet leaf fallback.

1. Add before or after an existing activity by selecting a duration: presets 5, 10, 15, 30, 45, 60, 90 and 120 minutes, plus custom 1-1,440 minutes.
2. Relative additions are linked. An addition after an activity begins at its end; before a linked activity takes that activity's start. Before a fixed appointment, it ends at the appointment's start.
3. New activities appear immediately as shared drafts awaiting organiser confirmation. Their duration reserves time immediately; confirming them does not shift times again.
4. Linked insertion shifts following linked activities later, preserving existing gaps and stopping at a fixed appointment or another planning day. Duration edits shift by the difference. Reject changes that overrun a fixed appointment.
5. Every activity can specify a clock start and duration, allowing independent activities and gaps. Explicit starts default to fixed; linked timing is an available alternative. Untimed activities are also supported.
6. Only organisers may relocate existing activities or confirm drafts, including through direct API calls. Guests may edit their own descriptive details and draft durations; organisers manage all entries and confirmed timing.
7. Organisers drag the entire card before or after another. Show the source and a clear insertion line/label. Remove Move, Move up and Move down buttons. Support touch hold-and-drag without breaking ordinary scrolling. Provide keyboard pickup, arrow-key positioning, drop and cancel on the focused card.
8. Moving closes the old duration and reserves the new position. Archiving closes its duration and restoring reserves it again. Preserve gaps and all retained child records.
9. The default main start is 2 PM, editable by organisers. Changing it moves the opening linked chain while fixed starts and other planning days retain their times.
10. Support exact offsets up to 365 days before/after. Each day has an independent running order. Overnight chains retain their selected planning day and label actual next-day times.
11. Store clock times as local event values, identical for visitors in other browser timezones; there is no timezone conversion or timezone setting. Audit timestamps use UTC.
12. Apply timing changes atomically with a shared schedule revision. Reject stale previews and out-of-range changes without partial saves. Existing stored times, titles and contributions must survive upgrades.

## Jobs and helping hands

A job belongs to an activity and has a title, optional instructions, helper capacity (1-100, default 1), creator and revision. Show open/covered status and all helpers compactly.

Guests and organisers can volunteer themselves or nominate a displayed name on someone else's behalf. Record the managing identity separately from the nominee. Duplicate display names do not imply the same person. Prevent duplicate self-assignments; allow distinct nominees with the same name.

The current participant can change/withdraw their own nominations and assignments. Organisers can manage all assignments. Show who nominated someone. My jobs groups current responsibilities and managed nominations by activity and returns to the timeline without losing the useful scroll position.

An optional **I'll take care of this** activity offer or **I'll do this** job offer creates the contribution, responsibility job where needed, and self-assignment atomically. Without the option, authorship does not imply responsibility.

## Permissions and archiving

Enforce every permission on the backend. Participants edit only their own contributions; organisers may edit any contribution, change settings, reorder, confirm drafts and restore archives.

Use soft deletion. Before archiving, explain affected jobs/helpers. Participants may archive their own contribution only when it has no active jobs or assignments belonging to others. Organisers may archive any entry.

Archiving changes only the selected record's archival flag. Descendants become hidden through the parent; retain child-job flags and assignment states. Reject new assignments under archived records. Restoring a parent does not reactivate independently archived jobs or withdrawn assignments. Reject restoring a job whose activity remains archived.

## Shared data and reliability

PostgreSQL is authoritative; browser storage and deployed filesystem files are not shared persistence.

- Load on open, after saves and on tab focus; allow manual refresh.
- Poll every 30 seconds only while visible, online and active within two minutes. Stop while idle, hidden or offline. No scheduled warmups, WebSockets or extra messaging service.
- Keep unsaved fields intact when background data changes. Explain conflicts and require explicit review of newer content.
- Use per-record revisions for descriptive edits and a running-order revision for scheduling changes.
- Use transactions on the same checked-out database connection. Lock capacity checks and claims, and coordinate resizing/archiving with assignments.
- Exactly one claim succeeds for the final place. Reject capacity reductions below retained active assignments.
- Use request IDs for safe retries without duplicate activities, jobs or nominations.
- Preserve entered text on failed saves and allow retry. Confirm success only after the backend saves.

## Backend and storage

Use parameterised SQL, bounded JSON requests, shared validation and safe errors. Identity comes from a server-validated session. Keep credentials out of browser bundles, source control, errors and logs.

Organiser credentials are server-only. Browser sessions use cryptographically random tokens stored as hashes, expire after 30 days, and use HttpOnly/SameSite cookies with Secure in production. Check same-origin requests and CSRF tokens for changes. Rate-limit sign-in, guest creation and writes through shared database state.

Use stable IDs and foreign keys for settings, participants, sessions, activities, jobs and assignments. Fetch the small timeline in one bounded request. Do not expose session hashes or access secrets. Responses are private and not shared-cacheable.

Limits: 500 activities, 2,500 jobs, 10,000 assignments, 2,000 identities, 16 KB JSON requests. Include archived records in storage bounds.

Use bundled static SVG icons only. Remove upload/retrieval routes, image processing dependencies, Blob storage integration and the media volume mount. Legacy database columns and historical files may remain untouched for non-destructive compatibility; do not delete existing data as part of simplifying the interface.

## Printing, accessibility and deployment

Print timeline hides editing controls and prints times, descriptions, jobs and assigned names. Browser PDF output is sufficient. No JSON export or dedicated PDF service.

Support keyboard navigation, visible focus, labelled icon buttons, associated input errors, readable contrast, reduced motion, small screens and browser resizing. Non-modal panels must preserve background scrolling and return focus after closing. Render user text safely.

Provide a locked Node 22 build, Netlify routing, server-only environment examples and native versioned migrations. Use the assigned database branch for each deployment context. No sample data or resets on startup/deployment. Optional development seeding must refuse an existing schedule.

Use Docker for building, running and testing before release. Tests use an isolated database and must not alter saved local or live planning data. Verify collaboration, permissions, timing/draft behavior, races/retries/conflicts, persistence, responsive layout, printing, and mouse/touch/keyboard dragging.

Prepare code and documentation locally. Hosted release requires the owner's deployment instruction and a configured Netlify site/database. Check hosted routing, secure cookies, preview isolation and redeployment in that environment. Do not make account or billing changes implicitly.

## Acceptance

The user can open without login, see the configured title, add relative or fixed-time activities while viewing the timeline, choose durations and dates several days away, and volunteer using compact cards. Organisers can set the start, confirm shared drafts, drag cards with visual feedback, edit through icons and restore archives. Removed access, upload, timezone, export and branding features are absent. Saved plans survive the Docker upgrade.

