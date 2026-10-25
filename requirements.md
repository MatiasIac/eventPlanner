# Wedding Timeline Project Requirements for Codex

Version 1.2  
Prepared 25 October 2026  
Purpose: implementation brief for a small application deployed from a Git repository to Netlify.

Latest owner changes: guests enter without sign-in, only organisers authenticate, the wedding start defaults to 2 PM and is editable, Before/After pages support arbitrary day offsets, fixed starts preserve gaps, helping-hand rows are compact, and the demonstration banner is removed.

Earlier owner follow-up: contextual timeline editing, durations, shared activity drafts and organiser-only reordering. These changes supersede the original no-approval and no-cascade defaults.

## 1. Product goal

Build a shared wedding-day timeline for Matías and Lisa. The application should help the couple and their invited participants understand the sequence of the day, record what needs to happen, and volunteer for jobs.

The main experience is one vertically scrolling timeline down the centre of the page. Each activity has a time on the line, a small picture, a title, a short paragraph, and associated roles with the names of the people helping.

People must see the same saved information when visiting from different browsers and devices. Participants can add activities, add jobs, volunteer themselves, and enter a child's name for a role such as flower girl. Someone offering to undertake an activity or job can create it and volunteer in the same interaction.

This is a single-wedding application. Keep its interface and architecture small, understandable, and easy to maintain.

## 2. Agreed requirements and implementation defaults

### Agreed product requirements

- A restrained visual style and normal vertical page scrolling.
- The timeline remains in the centre, with time labels directly over the line.
- Small pictures and short descriptive text at each activity.
- A timeline running from the first defined activity to the last.
- Activities and their associated jobs can be added.
- Participants can volunteer for existing roles or offer new activities/jobs.
- All devices use shared, persistent backend data.
- A small backend and database, deployed through a Git repository to Netlify.
- Examples include carrying the rings and being the flower girl.

### Defaults to use unless changed by the owner

| Decision | Default |
| --- | --- |
| Frontend | React, TypeScript, and Vite |
| Backend | TypeScript Netlify Functions |
| Shared database | Netlify Database, using PostgreSQL |
| Uploaded images | Netlify Blobs |
| Application scope | One wedding, one shared timeline |
| Language | English, using New Zealand spelling |
| Wedding timezone | Pacific/Auckland, editable by an organiser |
| Participant access | Automatic browser session; no sign-in or code; optional display name |
| Organiser access | Separate server-validated organiser credential |
| Contributions | New activities appear immediately as shared drafts pending organiser confirmation; jobs appear immediately |
| Editing | Organisers can edit everything; participants edit their own contributions |
| Live updates | Refresh on opening/focus, after saving, and every 30 seconds while actively viewing |
| Actual date and venue | Initially unset |
| Guest account recovery | An optional private return code can restore ownership in another browser |

These are implementation choices, not additional facts about the wedding. Activity confirmation happens directly on the timeline. Jobs and volunteering do not require approval.

Netlify currently documents integrated PostgreSQL, Functions, and Blobs. Netlify Database requires a credit-based plan, so verify account availability during setup. Do not promise that the application is free or that an existing subscription necessarily covers all usage. [S1], [S2], [S3], [S7]

If the chosen Netlify account cannot use Netlify Database, document that setup issue before substituting another managed PostgreSQL service. Build one database implementation; a multi-provider abstraction is unnecessary.

## 3. Visual and interaction requirements

### 3.1 Main page

Use a compact header with the wedding title or couple's names, the date when configured, and a small number of actions:

- Add activity.
- My jobs.
- Refresh.
- A menu containing print and organiser settings where permitted.

The timeline is the page's main content. Do not add a large hero section that pushes the schedule below the first screen.

Use an off-white or similarly light background, a thin timeline line, restrained accent colours, readable type, and generous spacing. Decorative ocean or mountain references may be subtle; the agreed layout must remain the focus.

Do not build a board game, illustrated landscape, branching map, free-form canvas, character system, points, achievements, confetti, or a dashboard dominated by metrics.

### 3.2 Desktop layout

- Centre the timeline line within the content area.
- Put every time badge directly over the line, with an opaque background that keeps the text readable.
- Place a small image on the left and the activity title/description on the right.
- Keep that arrangement consistent rather than alternating sides.
- Show compact helping-hand rows beneath the description, combining title, capacity and status, with helpers and actions kept visible.
- Use compact thumbnails, approximately 64–96 pixels, rather than large image cards.
- Render the line from the first timed activity to the last. Avoid a large empty line before or after the schedule.
- Keep related information visually together; an activity and its jobs form one entry.

Exact dimensions may be adjusted for readability while preserving the composition.

### 3.3 Phone layout

Keep the line and time badges centred. Below each time badge, use a readable card spanning most of the screen width. The line can be concealed behind the card and visible in the gaps between cards.

Within the card, place the thumbnail beside the title, followed by the paragraph and jobs at full readable width. Do not squeeze paragraphs into half-width columns or move the entire timeline to the far-left edge.

Use normal scrolling, comfortable touch targets, and accessible form controls. Essential actions must not require hover, dragging, or horizontal scrolling.

### 3.4 Entry controls

Show a subtle Add activity control between entries and at the end. A prominent Add activity action must also be available from the header.

Each entry provides editing actions only to permitted users. Clicking an image or paragraph must not unexpectedly start editing; use a clear Edit action.

Longer job instructions may expand on demand. Keep open places and assigned names visible without requiring someone to open every job.

Forms must support explicit Save and Cancel. Avoid saving incomplete text on every keystroke. Activity creation and editing use a non-modal side panel: move the timeline to the left on desktop and keep it scrollable. On phones use a collapsible bottom panel with the schedule still visible. Contextual before/after controls preserve the chosen position, and an unsaved preview shows the proposed activity and changed times.

## 4. Activities and scheduling

An activity is a point in the running order: ceremony, photographs, drinks, dinner, speeches, or an offered contribution.

### 4.1 Activity fields

| Field | Requirement |
| --- | --- |
| Title | Required; maximum 120 characters |
| Description | Short plain-text paragraph; maximum 1,200 characters |
| Start time | Local wedding time, or explicitly Time to be confirmed |
| Day offset | Wedding day, or 1-365 days before/after; preserve the selected planning day for overnight chains |
| Duration | Required; presets 5, 10, 15, 30, 45, 60, 90 and 120 minutes, plus custom 1-1,440 minutes |
| End time | Calculated from start and duration, including a next-day offset |
| Status | Draft pending organiser confirmation, or confirmed |
| Image | Optional uploaded image or a bundled illustration |
| Image alternative text | Meaningful alternative text; editable |
| Running order | Stable sequence, changed only by organisers for existing activities |
| Creator | Assigned by the backend from the current participant |
| Revision | Used to detect conflicting edits |

Date and location are configured once for the wedding, with an optional short location note on an activity where useful.

### 4.2 Chronological rules

1. Add an activity before or after an existing timed activity without re-entering a clock time. A new activity before a linked one takes its start; before a fixed appointment it ends at that appointment's start. An activity added after another begins at its end.
2. Choosing a linked duration reserves that amount of time and pushes following linked activities later until the next fixed start or another planning day. Drafts participate in these shared planning times immediately. Confirming a draft changes its status without shifting times a second time.
3. Each activity supports a start time and duration. Explicit clock starts default to fixed and preserve gaps. A scheduling selector can opt into linked timing instead. Fixed starts stop cascades; reject a chain that would overrun its next fixed appointment. Untimed activities keep their selected planning day.
4. Only organisers may relocate an existing activity: drag and drop before/after another, use move-up/down buttons, or use the placement selector. These permissions must also apply to direct API requests.
5. Moving an activity closes its old duration and reserves it in the new position. Changing a duration shifts later activities by the difference. Preserve existing gaps; clear an overlap at a relative insertion point when necessary. Explicit clock placement may overlap a preceding activity.
6. New activities default to draft, including those created by organisers unless they explicitly confirm while saving. Organisers can confirm on the timeline or archive a draft to decline it. Creators can adjust their own draft duration and descriptive information; organisers control confirmed timing.
7. Archiving a timed activity closes its duration. Restoring reserves its duration at its saved start. Keep descendants and assignments intact under the existing soft-deletion rules.
8. Apply structural changes and affected revisions atomically with a running-order revision. Reject stale previews and out-of-range cascades instead of partially applying changes. Times must stay within 365 days before/after the wedding.
9. Provide Before, Wedding day and After pages, with exact offsets and calendar dates when configured. The wedding starts at 2 PM by default; organisers can change it and move the opening linked chain while fixed starts and other planning days stay unchanged.
10. Preserve pre-existing starts on upgrade. Infer an editable, labelled duration estimate from the old end or next start when needed; treat pre-existing entries as confirmed. Jobs continue to inherit their activity's timing.

Store schedule times as local event times with an explicit day offset and wedding timezone. Preserve these clock times for every visitor, including someone browsing from another timezone. Server audit timestamps should use UTC.

A date can remain unset during planning. When it is configured, the existing schedule should retain its local times. Mark after-midnight entries Next day so 12:30 am appears after the evening party.

### 4.3 Offering an activity

The Add activity form includes an optional checkbox: I'll take care of this.

When checked, save the activity, create a one-person job within it, and assign the creator in one atomic operation. Use an editable job title such as Take care of this activity. Explain the resulting assignment in the form so responsibility is visible and intentional.

The creator of an activity is not automatically responsible for doing it when this checkbox is unchecked.

## 5. Jobs, roles, and nominations

A job belongs to one activity. A role is the same underlying concept and should not require a separate system.

For example, The ceremony can contain Carry the rings, Flower girl, and Play the entrance music.

### 5.1 Job fields

- Title, required, maximum 120 characters.
- Optional instructions, maximum 1,200 characters.
- Number of helpers required, default 1, positive whole number.
- Creator and parent activity, assigned/validated by the backend.
- Active assignments.
- Revision and created/updated timestamps.

Keep the initial form small. Capacity and additional instructions can be less prominent than the title.

### 5.2 Volunteering

A participant selects I can help. The server records the assignment and returns the saved result. The job then shows their display name, their own assignment state, and a Withdraw action.

Show both capacity and current assignments clearly, for example 1 of 2 helpers. A full job displays Covered and prevents further claims.

Withdrawing frees a place. Repeated taps or retrying a request must not create duplicate assignments.

When creating a job, an I'll do this checkbox allows the creator to volunteer immediately. Creating the job and claiming its place must succeed or fail together.

### 5.3 Nominating a child or another person

Provide Nominate someone alongside self-volunteering. Collect only the name needed to display the nomination and identify it as an on-behalf nomination.

Record separately:

- The person displayed as doing the job.
- The signed-in participant who created and manages the nomination.

A parent can nominate their child as flower girl without creating an account for the child. The parent can change or withdraw that nomination.

An on-behalf nomination consumes a place just like a self-assignment. A participant may manage nominations for more than one person.

Do not use typed names to prove account identity or to grant editing rights. People with the same display name must remain separate participants.

### 5.4 My jobs

Provide a small view or filter showing the current participant's own jobs and nominations they manage, ordered by activity time. Include the activity, time, job instructions, and displayed nominee.

Returning to the full timeline must preserve a sensible scroll position. This is a convenience view over the same shared data, not a second schedule.

## 6. Participant access and permissions

Use lightweight access suitable for a known wedding group. Full email/password registration and social login are outside the initial scope.

### 6.1 Entry and sessions

- Guests open the timeline directly, with an automatic server-issued browser session and no account, code or name gate.
- Provide an optional name field for contributions. Only organisers sign in using their credential; guest roles must never be granted organiser rights from browser-supplied data.
- Create a stable participant ID and a cryptographically random session token.
- Keep the session in a Secure, HttpOnly, SameSite cookie in production.
- Store only a hash of an opaque session token in the database; include expiration and revocation.
- Use a documented session lifetime suitable for planning, such as 30 days.
- Display names are informal labels for this trusted group, not verified identities.
- An organiser enters a separate credential. The backend decides the organiser role; a role supplied by a browser is never authoritative.
- Keep all access credentials in server-only configuration or securely hashed storage. Never include them in the frontend bundle or repository.

Provide a private personal return code so a participant can restore their own identity from another browser. Store its hash, avoid logging it, and allow rotation. Show the code only to its participant when generated. Recovery uses that secret, not a matching display name.

Personal recovery is optional and must never interrupt normal guest entry. It reconnects an existing identity in another browser.

Revoking a participant invalidates their sessions and personal return code. Check the participant's revoked state on every authenticated request. Preserve their contributions and assignments unless an organiser changes those separately.

Revocation blocks an identity, not a real-world person: a new browser can receive a new guest identity. Do not imply otherwise. The shared wedding access code is no longer used.

### 6.2 Permissions

| Action | Participant | Organiser |
| --- | --- | --- |
| View the shared timeline and names | Yes | Yes |
| Create an activity or job | Yes | Yes |
| Edit an activity or job they created | Yes | Yes |
| Edit another person's activity/job | No | Yes |
| Volunteer or nominate someone | Yes | Yes |
| Change/withdraw nominations they manage | Yes | Yes |
| Manage another participant's assignment | No | Yes |
| Reorder existing activities or confirm drafts | No | Yes |
| Change wedding settings | No | Yes |
| Export the schedule | No | Yes |
| Revoke access and restore archived entries | No | Yes |

Enforce these permissions on every backend operation, including requests made directly to the API.

A participant-created activity appears immediately as a shared draft, with its author and pending confirmation visible. Only organisers can confirm activities or relocate existing ones.

### 6.3 Archiving

Use soft deletion for activities and jobs.

Before archiving an activity, show that its jobs and assignments will disappear from the active schedule. Before archiving a job, show the affected volunteers.

Participants can archive their own contribution only if it has neither active descendant jobs created by another participant nor active assignments managed by another participant. An organiser can archive any entry after the consequence is shown.

Archiving changes only the selected record's archived flag among the archival states, and closes its time in the running order. Its descendants become hidden through their parent's state; do not rewrite child-job flags or assignment states. New assignments to an archived activity/job must be rejected.

Restoring clears only the selected record's flag and reserves its time again. Independently archived child jobs and previously withdrawn nominations remain inactive. Reject restoring a job while its parent activity is archived. Capacity checks count all retained active assignments on the job, including while hidden, so restoration cannot overfill it.

## 7. Shared state and reliable saving

The database is the authoritative source of activities, jobs, participants, and assignments.

Browser storage may hold preferences and unsaved drafts. It must not be the only place schedule information is saved. Do not treat a JSON file in a deployed function's filesystem as the persistent database.

### 7.1 Refresh behaviour

- Load current data when the page opens.
- Refresh after a successful change and when the browser tab regains focus.
- Offer manual Refresh.
- Poll every 30 seconds only while the page is visible and the person has interacted within the last two minutes.
- Pause polling when hidden, offline, or idle; resume on interaction/focus.
- Do not run keepalive requests when nobody is using the application.
- Show a quiet Last updated state and make connectivity errors visible.
- While actively viewing with a healthy connection, other participants' saved changes should appear within roughly 30 seconds.

When a form is open, background updates must not replace its unsaved text. If the underlying record changed, show a clear conflict and let the person review the newer content.

WebSockets, collaboration cursors, and a real-time messaging service are unnecessary for this version.

### 7.2 Atomic operations and conflicts

Use a database transaction to check and claim available places. The capacity check and assignment must not be separate, unprotected read/write operations.

For a final remaining place claimed concurrently by two participants, exactly one request succeeds. The other receives an understandable conflict message and the current job state.

The transaction must also validate the parent activity/job is active. Capacity changes, archiving, and claims must coordinate through consistent locking or an equivalent database-enforced mechanism.

Prevent duplicate self-assignments. Use request IDs or equivalent idempotency handling so a network retry does not duplicate a new activity, job, or nomination. Distinct on-behalf nominees from the same participant remain supported.

Use per-record revisions for activity/job edits. Reject stale edits instead of silently overwriting someone else's newer changes. Unrelated descriptive edits should not conflict merely because the overall timeline changed. Structural scheduling changes additionally validate the shared running-order revision.

Reject a capacity reduction below the number of active assignments.

### 7.3 Saving and failure states

Provide clear Saving, Saved, and Could not save states.

Disable duplicate submissions while pending, retain entered content after failure, and allow retry. Treat a save as successful only after the backend confirms it. If using optimistic UI, roll it back on failure.

Return safe, actionable errors. The page must remain useful when a request fails, with the last successfully loaded timeline still visible and clearly identified as potentially stale.

## 8. Images

Every activity can use a bundled image/illustration, a custom upload, or a quiet fallback symbol.

Supply a small consistent set of bundled images for common activity types: ceremony/rings, flowers, photographs, drinks, food, speeches, cake, music, and transport. Use original or appropriately licensed assets and document third-party licences.

Support JPEG, PNG, and WebP uploads. Set an application limit of 2 MB per image and explain it in the form. Validate content type, file contents, and size on the backend; do not trust the filename alone.

Optimise images for their small display size. Preserve aspect ratio using predictable cropping, fixed thumbnail dimensions, and lazy loading. Avoid storing image bytes or base64 strings inside schedule records.

Store uploads in Netlify Blobs and store metadata/references in PostgreSQL. Serve uploads through the application route, available to automatically admitted guests as well as organisers. Bundled decorative assets can be static.

Use durable production storage so uploads survive redeployments. Netlify documents that site-wide Blobs stores persist across deployments and are accessible across deploy contexts; preview isolation therefore needs explicit configuration. [S3]

Use separate production and preview upload namespaces. Preview code must never overwrite or delete production uploads. An unavailable preview image may show the normal fallback.

## 9. Backend architecture and data model

Use one repository containing the frontend, Netlify Functions, shared validation/types, and database migrations.

All authoritative reads and writes pass through the backend. Keep database credentials, session secrets, and storage credentials out of browser code.

Use parameterised database queries, bounded request sizes, and backend validation. Use mature libraries for session/security primitives where appropriate.

### 9.1 Suggested entities

This is a logical model; names can vary if the behaviour stays clear.

| Entity | Essential information |
| --- | --- |
| Wedding | ID, title/couple names, optional date/venue, timezone, settings revision |
| Participant | ID, display name, participant/organiser role, personal return-code hash, revoked state |
| Session | Participant ID, session-token hash, expiry, revocation |
| Activity | Wedding ID, title, description, local start/end times and day offsets, image reference, duration, running order, draft/confirmed status, confirmer, creator, revision, archived state |
| Job | Activity ID, title, instructions, capacity, creator, revision, archived state |
| Assignment | Job ID, optional participant performing the job, displayed on-behalf name where applicable, managing participant, active/withdrawn state |
| Image | Storage reference, content type, size, alternative text, uploader, creation timestamp |

Use stable IDs, foreign keys, suitable indexes, and timestamps. Store actor/owner IDs from the validated session rather than accepting them as trusted client input.

For self-assignment, the performing participant is the current participant. For an on-behalf nomination, retain the displayed name and managing participant even if the nominee has no account.

Uniqueness rules must protect self-assignments and identical retries without treating two different people with the same name as the same person.

### 9.2 API responsibilities

The exact routing structure can be adapted, but provide these operations:

| Area | Operations |
| --- | --- |
| Session | Join, get current participant/permissions, recover identity, rotate personal return code, sign out |
| Timeline | Fetch wedding settings, ordered activities, jobs, assignments, and current freshness metadata |
| Wedding settings | Organiser update |
| Activities | Create draft, edit, cascade times, organiser move/confirm, archive, organiser restore |
| Jobs | Create, edit, archive, organiser restore |
| Assignments | Volunteer, nominate, update an owned nomination, withdraw; organiser management |
| Images | Upload and authorised retrieval |
| Organiser utilities | Export schedule, revoke participant access, list archived entries |

Fetch the small timeline in one bounded aggregate request rather than issuing a request for each card. Do not return session tokens, return-code hashes, access secrets, or private infrastructure configuration.

Use appropriate validation, unauthorised, forbidden, not-found, and conflict responses. Return current record versions where needed.

Avoid shared caching of browser-specific API responses. Guest access is open, including activity pictures. Validate same-origin state-changing requests and include CSRF protection suited to cookie sessions. Rate-limit organiser sign-in attempts, automatic guest creation and abusive writes using a mechanism that works across serverless instances.

## 10. Netlify deployment, development, and operating costs

### 10.1 Deployment

Provide a working Netlify configuration with:

- Reproducible frontend build and publish directory.
- Functions directory and API routing.
- API routing evaluated before the single-page-app fallback.
- An explicitly supported Node.js runtime and dependency lockfile.
- Server-only environment configuration and an example environment file containing placeholders.
- A documented database provisioning/linking step.
- Database migrations and separate sample-data tooling.
- Separate production and preview configuration for credentials and uploads.

Netlify Functions deploy with repository-managed site code. Native Netlify Database migrations are tracked in netlify/database/migrations and applied by the platform during deployment. Follow the current official workflow and avoid running the same migrations independently a second time. [S1], [S4]

Use the database branch assigned to each deployment context. Netlify documents isolated database branches for deploy previews. Never override a preview's connection with a hard-coded production URL. [S2]

Redeploying frontend or backend code must preserve timeline records, people, assignments, and uploaded pictures. A code rollback must not reset business data.

### 10.2 Local development

Document installation, local environment setup, database startup/migrations, seeding, application startup, tests, and the production build.

Use Netlify's supported local development workflow. Its current tooling supports a local PostgreSQL-compatible database with the CLI or Vite plugin, and local migrations must be applied explicitly. [S5]

Local work must use local/test records. Do not make routine tests contact the live wedding database.

If the repository already has a suitable framework, preserve it rather than rewriting solely to match a preferred starter.

### 10.3 Database transactions

Use a supported PostgreSQL transaction interface. Netlify's database API exposes a connection pool for transactions; transaction statements must use the same checked-out connection and release it afterwards. [S6]

Do not simulate a transaction by independently issuing queries through unrelated pooled connections.

### 10.4 Operating cost

Keep the database small, images optimised, payloads compact, and polling bounded. Avoid scheduled warmup requests, always-on workers, or additional paid services for routine features.

Document the chosen database sleep settings and where the owner can monitor usage. Database compute and bandwidth consume credits, and sleep/scale settings affect compute usage. Verify current billing in the account rather than quoting a guaranteed monthly cost. [S7]

## 11. Printing, export, and sample content

Provide a print stylesheet and Print timeline action. Print times, descriptions, roles, and assigned names while hiding editing buttons and unnecessary decorative elements. Browser printing can produce a PDF; no dedicated PDF-generation service is required.

Provide an organiser-only JSON export of wedding settings, activities, jobs, assignments, display names, and image references. Include a schema version and export timestamp. Exclude all access credentials, sessions, and recovery secrets.

Document that JSON export contains image references, not uploaded image bytes, and how to retrieve a complete database/media backup with the chosen provider tools.

Remove the demonstration banner from the application. Keep optional sample content documented as development data; do not delete or replace existing activities when removing the banner. Suggested examples:

| Example activity | Example jobs |
| --- | --- |
| Ceremony | Carry the rings; Flower girl; Play the entrance music |
| Congratulations and photographs | Gather photo groups; Collect ceremony items |
| Drinks and mingling | Bring ice; Help with refreshments |
| Meal | Help guests find their seats |
| Speeches | Coordinate speakers; Handle the microphone |
| Evening party | Help with music; Coordinate rides; Help pack up |

Any demonstration times are illustrative. Do not invent an actual wedding date, venue, guest name, song, or confirmed sequence.

Seed development data through an explicit command. Never overwrite production data or re-add demonstration content on every deployment. The initial live application may start with an empty timeline.

## 12. Accessibility and quality

- Support keyboard navigation and visible focus.
- Give inputs accessible labels and errors connected to their fields.
- Keep text and interactive controls readable against their backgrounds.
- Use text labels as well as colour for Open, Covered, Saving, and error states.
- Support reduced motion and browser text resizing.
- Keep non-modal panels usable on small screens and return focus after closing; the timeline remains visible and scrollable.
- Render paragraphs as safe text rather than arbitrary HTML.
- Use meaningful alternative text or appropriate decorative-image handling.
- Verify at a narrow phone width, tablet width, and a typical desktop width.
- Avoid layout jumps while images load.
- Keep the small application's initial download and request count modest.

## 13. Acceptance criteria

The implementation is ready when all of the following are demonstrably true:

1. The main experience is an understated vertical timeline with a centre line, time badges, small pictures, titles, paragraphs, and jobs.
2. The centre-line design remains readable on a phone without horizontal scrolling.
3. Contextual insertion, duration changes and organiser moves update the running order and subsequent times correctly, including entries after midnight.
4. Activities with no time appear in the clearly labelled unconfirmed-time section.
5. A participant can add a draft through the timeline with a duration preview; another browser sees the saved draft and shifted planning times. Organiser confirmation does not shift them again.
6. A participant can add a job and volunteer for it during creation.
7. Offering to take care of a new activity creates its responsibility assignment atomically.
8. Carry the rings can be claimed by a participant.
9. A parent can nominate their child as Flower girl and later withdraw that nomination.
10. My jobs includes both self-assignments and nominations managed by the current participant.
11. A full job rejects additional claims, including two simultaneous claims for its final place.
12. Repeating an identical submission after a timeout does not create duplicates.
13. Participants cannot edit another person's contributions or nominations through direct API calls.
14. Organisers can manage all entries and change wedding settings.
15. Conflicting edits do not silently overwrite newer text.
16. A failed save preserves entered text and provides a usable retry.
17. Archived entries reject new claims and can be restored by an organiser with their retained records.
18. Records and uploaded images survive a redeploy.
19. A preview deployment cannot mutate the production database or production uploads.
20. Another browser sees the same schedule; the personal return code restores the participant's editing identity there.
21. Background polling stops for hidden/idle pages and resumes on renewed use.
22. The printed schedule contains the useful running order and roles.
23. A clean checkout can run locally and build for Netlify using the documented steps.
24. Production startup does not silently create invented wedding details or overwrite existing records.

Test business-critical behaviour with real database-backed integration tests, particularly capacity races, idempotency, permissions, and edit conflicts. Add a small number of end-to-end checks for the main participant flows and responsive layout.

Do not create a large test suite that merely mirrors component implementation. Report the checks actually run and any deployment verification that still requires the owner's account.

## 14. Required repository deliverables

Codex should deliver:

- A complete responsive frontend and working backend.
- Database schema, constraints, indexes, and versioned migrations.
- Image storage and retrieval integration.
- Session handling and server-enforced permissions.
- Meaningful automated checks for the behaviours identified above.
- Netlify configuration, dependency lockfile, and example environment configuration.
- Development sample-data tooling.
- A README with local development, provisioning, deployment, guest/organiser access, personal-code recovery, backups, and operating-cost notes.
- A concise implementation report explaining what works, how it was verified, and any account setup still required.

Keep frontend, API, validation, data access, and migrations in clearly named locations without adding microservices or an elaborate architectural framework.

## 15. Boundaries and implementation instructions

Implement the agreed product faithfully. Routine engineering choices can be resolved without repeated questions; record significant assumptions in the README.

Prioritise the vertical timeline, shared persistence, and volunteer flows before optional refinements. A static mock-up or localStorage-only implementation does not meet the requirements.

Do not add RSVP management, seating-plan tools, gift registries, payments, chat, email/SMS notifications, a guest photo gallery, calendar integrations, multi-wedding tenancy, or AI-generated content.

Use a Netlify-oriented repository. Do not reuse or deploy an unrelated ChatGPT Sites/Vinext project solely because an earlier prototype shell exists.

Prepare the repository and deployment instructions. Do not purchase services, change account plans, send invitations, or publish the application without the owner's deployment instruction. This document is an implementation brief, not authority to perform those external actions.

## 16. Official technical references

Platform capabilities were checked on 25 October 2026. Recheck current tooling and account eligibility during implementation.

- [S1: Netlify Functions overview](https://docs.netlify.com/build/functions/overview/) — repository-managed server functions.
- [S2: Netlify Database overview](https://docs.netlify.com/build/data-and-storage/netlify-database/) — managed PostgreSQL and deployment branches.
- [S3: Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) — uploaded files, durable stores, and deployment-context behaviour.
- [S4: Database migrations](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/) — migration layout and deployment lifecycle.
- [S5: Database local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/) — local database and migration workflow.
- [S6: Database API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/) — SQL access and transaction connection pool.
- [S7: Database billing and usage](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/) — plan eligibility, metered usage, and sleep/scale settings.

[S1]: https://docs.netlify.com/build/functions/overview/
[S2]: https://docs.netlify.com/build/data-and-storage/netlify-database/
[S3]: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
[S4]: https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/
[S5]: https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/
[S6]: https://docs.netlify.com/build/data-and-storage/netlify-database/api/
[S7]: https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/

