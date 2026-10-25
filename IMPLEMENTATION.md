# Implementation and verification

Updated 25 October 2026 against requirements version 1.3. The application runs locally in Docker at http://localhost:8888. No remote site, repository, account or billing plan has been changed.

## Delivered

The planner uses its configured title as both the main heading and browser title. The fixed slogan, event branding, demonstration card, freshness text, timezone display/control, access/recovery menus, participant administration and JSON export are removed.

Guests open the timeline directly. The optional person icon edits their display name; organiser sign-in asks for a display name and organiser code. Existing browser-session names and database identifiers are retained internally so the upgrade does not discard ownership or plans.

Activities use bundled icons. Upload/serving routes, image-processing code, direct Sharp/Blobs dependencies and the Docker media mount are removed. There is no Blob storage requirement. Existing legacy database columns and historical media files have not been deleted.

Activity edit, archive and confirmation controls are icons with accessible names. Job editing, archiving, nomination management and withdrawal use icons at the top right of compact cards. Add before appears once, outside the first activity card; Add activity remains in the timeline between entries.

Organisers drag whole cards using mouse or touch. The source fades and a line with a destination label marks the drop position. Touch uses a brief hold so ordinary swipes keep scrolling. Keyboard users pick up the focused card with Space, choose with arrows, drop with Enter or cancel with Escape. Separate movement buttons are gone. Backend organiser permissions and stale schedule checks still apply.

Existing scheduling features remain: a scrollable timeline beside the editor, duration presets and unsaved previews, shared drafts and organiser confirmation, fixed starts and linked timing, adjustable main start, Before/Main day/After pages with exact offsets, overnight chains, volunteering/nominations, My jobs, and soft archive/restoration.

## Checks run for this update

| Check | Result |
| --- | --- |
| Docker Node 22 build, TypeScript and Vite production build | Passed |
| PostgreSQL integration tests | **20 passed** |
| Chromium browser tests against the built application in Docker | **10 passed** |
| Mouse, touch and keyboard reordering; cancellation and visible insertion feedback | Passed |
| Guest entry, saved title, generic settings/menu, bundled icons and removed features | Passed |
| Side-panel preview, background scrolling, preserved drafts and concurrent schedule review | Passed |
| Responsive layout and overflow | Passed at 320, 390, 768 and 1440 pixels |
| Printing and browser PDF generation | Passed |
| Netlify Function packaging | Passed |
| Production dependency audit | 0 vulnerabilities reported |
| Migration and recreation of the running local app | Passed; app and database healthy |
| Browser smoke check against the recreated app and saved local data | Passed; 6 active activities displayed |

The 20 integration checks cover ownership and organiser permissions, atomic offers and rollback, capacity races, claim/archive coordination, idempotent retries, revisions and conflicts, nomination withdrawal, retained archive descendants, fixed and linked timings, draft approval, multi-day independence, changed main start, midnight limits, removed API routes and request throttling.

The browser suite verifies separate identities and a visitor in a different timezone, shared activities/jobs/nominations, ownership after reload, failed-save retention, background conflicts, configured title, compact controls, settings/archive restoration, keyboard focus, active/idle/offline polling, side-panel layout, drag input methods, day pages, independent starts and durations.

Before and after the running-app upgrade, complete row fingerprints matched for all **9 activities, 17 jobs, 5 assignments and the settings record**. This includes archived activities. No existing title, time, description, job, assignment or setting was changed by the upgrade. The new migration supplies a generic title only for an empty installation still using the original default.

Visual artifacts are local and ignored by source control: `test-results/timeline-390.png`, `timeline-768.png`, `timeline-1440.png`, `timeline-print.pdf`, `timeline-panel-desktop.png`, `timeline-panel-phone.png`, `compact-help-phone.png`, `card-drag-desktop.png`, `card-drag-touch.png`, `before-page-phone.png`, `after-page-desktop.png`, `running-app-desktop.png`, and `report/index.html`.

The built frontend is approximately 274 KB JavaScript (85 KB gzip) and 32 KB CSS (8 KB gzip), plus small SVGs. It requests no external font, image or tracking services.

## Implementation notes

PostgreSQL remains authoritative. Shared transactions coordinate schedule revisions, record changes, capacity checks and idempotent retries. Fixed appointments stop duration cascades; conflicting changes fail atomically. Confirmation changes status without shifting times again. Each planning day remains independent.

The existing Compose project, database/table names and cookie identifiers remain internal compatibility details. They are not application branding. Earlier schema migrations are immutable; the additive generic-default migration preserves current records. Unused historical image/recovery/timezone columns are deliberately left in place without exposing those features.

Guest ownership is remembered by the browser cookie for 30 days. Clearing it or using another browser creates a separate identity; organisers can manage all contributions. There is no recovery-code workflow.

The first browser run exposed an ambiguous test selector after the name icon and input acquired the same accessible name. The selector now targets the textbox; the complete browser suite passed. Current production build and standalone Function packaging were tested in Docker. A browser smoke check used localhost within the app's Docker network namespace, matching the local secure-context behavior needed by browser cryptographic APIs.

## Hosted release limits

No linked Netlify account/site was supplied. Hosted Database availability, provisioning, branch isolation, secure cookies, and persistence through a hosted redeploy need verification in an authorised preview. README contains setup instructions. The local Docker adapter is intended for local/test use; hosted operation uses the Netlify Function over HTTPS.

Earlier baseline Netlify Dev emulation was verified before this update. It was not repeated for this simplification. Standalone Function packaging and the current Docker backend/browser checks passed. An earlier account-free `netlify build --offline` could not provision its Database step; a full hosted build remains dependent on linking a site.

Chromium desktop and emulated touch were tested. Real-device Safari/Firefox and a full assistive-technology audit were not run.

The dependency install still reports two high-severity development-tool findings in the Netlify CLI toolchain, previously traced to its TOML parser. They are absent from the production dependency audit. No incompatible forced CLI downgrade was applied.

