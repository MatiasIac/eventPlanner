# Implementation and verification

Updated 25 October 2026 against requirements version 1.4. The application runs locally in Docker at http://localhost:8888. These updates have not been pushed or deployed to the owner's existing Netlify site.

## Delivered

The planner uses its configured title as both the main heading and browser title. The fixed slogan, event branding, demonstration card, freshness text, timezone display/control, access/recovery menus, participant administration and JSON export are removed.

Guests open the timeline directly. The optional person icon edits their display name; organiser sign-in asks for a display name and organiser code. Existing browser-session names and database identifiers are retained internally so the upgrade does not discard ownership or plans.

Activities use 24 bundled icons in a visual radio grid, including waves, palm, shell, sun, moon, tables and chairs. Upload/serving routes, image-processing code, direct Sharp/Blobs dependencies and the Docker media mount are removed. There is no Blob storage requirement. Existing legacy database columns and historical media files have not been deleted.

Activity edit, archive and confirmation controls are icons with accessible names. Job editing and archiving remain at the top right; nomination editing and withdrawal sit beside each person's name. Nomination forms offer one field per vacant place and save all entered names atomically, retaining the draft on capacity conflicts. Each name keeps its own manager, revision and controls. Add before appears once, outside the first activity card; Add activity remains in the timeline between entries.

A few helpful details provides bold, italic and bullet-list buttons using a lazily loaded Tiptap editor. Documents are validated as bounded JSON and rendered through safe React elements, never injected HTML. Existing plain descriptions remain readable and editable. Formatting survives reload, editing, sharing and printing.

Organisers select Beach, Night, Garden, Sunset or Lavender in Settings. Beach is the default. The saved theme colours the whole page and all panels for every visitor, using the existing refresh/polling behaviour. Print styles remain white with dark text. The choices require no new environment variables.

Organisers drag whole cards using mouse or touch. The source fades and a line with a destination label marks the drop position. Touch uses a brief hold so ordinary swipes keep scrolling. Keyboard users pick up the focused card with Space, choose with arrows, drop with Enter or cancel with Escape. Separate movement buttons are gone. Backend organiser permissions and stale schedule checks still apply.

Existing scheduling features remain: a scrollable timeline beside the editor, duration presets and unsaved previews, shared drafts and organiser confirmation, fixed starts and linked timing, adjustable main start, Before/Main day/After pages with exact offsets, overnight chains, volunteering/nominations, My jobs, and soft archive/restoration.

## Checks run for this update

| Check | Result |
| --- | --- |
| Docker Node 22 build, TypeScript and Vite production build | Passed |
| PostgreSQL integration tests | **23 passed** |
| Chromium browser tests against the built application in Docker | **13 passed** |
| Atomic group nominations, individual controls and concurrent last-place claims | Passed |
| Visual icon picker; safe bold, italic and bullet details across reload/edit/share/print | Passed |
| Five shared themes across browsers, phone layouts, panels and printing | Passed |
| Mouse, touch and keyboard reordering; cancellation and visible insertion feedback | Passed |
| Guest entry, saved title, generic settings/menu, bundled icons and removed features | Passed |
| Side-panel preview, background scrolling, preserved drafts and concurrent schedule review | Passed |
| Responsive layout and overflow | Passed at 320, 390, 768 and 1440 pixels |
| Printing and browser PDF generation | Passed |
| Netlify Function packaging | Passed |
| Production dependency audit | 0 vulnerabilities reported |
| Migration and recreation of the running local app | Passed; app and database healthy |
| Browser smoke check against the recreated app and saved local data | Passed; 6 active activities displayed |

The 23 integration checks cover ownership and organiser permissions, atomic offers and rollback, capacity races, claim/archive coordination, idempotent retries, revisions and conflicts, nomination withdrawal, retained archive descendants, fixed and linked timings, draft approval, multi-day independence, changed main start, midnight limits, removed API routes and request throttling. New checks verify group nomination retries and all-or-nothing capacity races; formatted-document validation, unsafe-node rejection and older-client compatibility; and shared theme persistence, permissions and unchanged scheduling.

The browser suite verifies separate identities and a visitor in a different timezone, shared activities/jobs/nominations, ownership after reload, failed-save retention, background conflicts, configured title, compact controls, settings/archive restoration, keyboard focus, active/idle/offline polling, side-panel layout, drag input methods, day pages, independent starts and durations. It also fills four vacancies together, edits/withdraws individual names, preserves a failed nomination after another guest takes the last place, saves/reopens formatted details and applies all five themes across separate browsers.

Before and after this running-app upgrade, row fingerprints matched for all existing fields in **9 activities, 17 jobs, 6 assignments and the settings record**, including archived activities. The comparison excludes only the newly added theme and formatted-description columns. Migration `202610250006_details_and_themes.sql` adds Beach as the shared theme and nullable formatted content without rewriting existing values. The recreated app displays all six active activities.

Visual artifacts are local and ignored by source control: timeline screenshots at phone/tablet/desktop widths, panel/drag/day-page screenshots, `helpers-per-person-phone.png`, `visual-icon-picker.png`, `formatted-details-editor.png`, `formatted-timeline.pdf`, and `theme-{beach,night,garden,sunset,lavender}-{desktop,phone,settings}.png` under `test-results/`. The running-app screenshot and `report/index.html` are there too.

The initial frontend is approximately 280 KB JavaScript (87 KB gzip) and 40 KB CSS (9 KB gzip), plus small SVGs. Opening an activity editor loads an additional 409 KB JavaScript chunk (130 KB gzip). It requests no external font, image or tracking services.

## Implementation notes

PostgreSQL remains authoritative. Shared transactions coordinate schedule revisions, record changes, capacity checks and idempotent retries. Fixed appointments stop duration cascades; conflicting changes fail atomically. Confirmation changes status without shifting times again. Each planning day remains independent.

The existing Compose project, database/table names and cookie identifiers remain internal compatibility details. They are not application branding. Earlier schema migrations are immutable; the new theme/details migration is additive. Unused historical image/recovery/timezone columns are deliberately left in place without exposing those features. JSON requests allow 64 KB for formatting overhead while description text stays limited to 1,200 characters, 400 nodes and eight nesting levels.

Guest ownership is remembered by the browser cookie for 30 days. Clearing it or using another browser creates a separate identity; organisers can manage all contributions. There is no recovery-code workflow.

Browser checks exposed an editor lifecycle issue on reopening after a reload; initial rendering and synchronisation now respect editor creation/destruction. Visual review also corrected font synthesis so fallback fonts can display formatted text. The final complete browser suite passed. Current production build and standalone Function packaging were tested in Docker. A browser smoke check used localhost within the app's Docker network namespace, matching the local secure-context behaviour needed by browser cryptographic APIs, and verified the saved Beach theme and retained timeline.

## Hosted release limits

The owner has an existing Netlify deployment. This session verified the update locally and did not change that site. Redeploy the source with migration 006; no additional environment variables are required. Hosted branch isolation, secure cookies and persistence through that redeploy still need verification on the site. README contains setup instructions. The local Docker adapter is intended for local/test use; hosted operation uses the Netlify Function over HTTPS.

Earlier baseline Netlify Dev emulation was verified before this update. It was not repeated for these features. Standalone Function packaging and the current Docker backend/browser checks passed; no hosted build was triggered.

Chromium desktop and emulated touch were tested. Real-device Safari/Firefox and a full assistive-technology audit were not run.

The dependency install still reports two high-severity development-tool findings in the Netlify CLI toolchain, previously traced to its TOML parser. They are absent from the production dependency audit. No incompatible forced CLI downgrade was applied.

