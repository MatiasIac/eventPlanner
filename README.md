# Matías & Lisa — our wedding day

A shared wedding timeline with open guest access and organiser-only administration: React + TypeScript + Vite, TypeScript Netlify Functions, PostgreSQL through Netlify Database, and authenticated uploads in Netlify Blobs. The schedule starts empty, with the date and venue unset and an editable 2 PM wedding start.

## Run locally with Docker

Requirements: Docker Desktop running Linux containers. Node 22 is only needed on the host for the optional environment helper; all building, database operations and testing can run inside Docker.

```sh
node scripts/create-local-env.mjs
docker compose build app
docker compose up -d db
docker compose run --rm app npm run db:migrate:local
docker compose up -d app
```

Open **http://localhost:8888**. Guests see the timeline immediately, without signing in, entering a code or providing a name. The browser automatically remembers their contributions. Adding a display name through **Add your name (optional)** is encouraged when helping. Organisers choose **Organiser sign in** in the menu and use `ORGANISER_CREDENTIAL` from the ignored `.env`. The environment helper leaves an existing `.env` untouched. Alternatively, copy `.env.example` and choose an organiser secret of at least 16 characters. `WEDDING_ACCESS_CODE` is no longer used.

Only port 8888 is exposed, on the host loopback interface. PostgreSQL stays on Docker's private network. The `database` and `media` named volumes preserve information when containers are stopped, rebuilt or recreated. `docker compose down` preserves those volumes; **`docker compose down -v` deletes them**. Do not use the Docker adapter as a public production server; production uses the Netlify Function and secure HTTPS cookies.

Optional development sample content (the demonstration banner has been removed):

```sh
docker compose exec app npm run db:seed
```

The seed refuses a non-empty schedule, never runs at startup/deployment, and cannot run in production. Demo activities, times and text are illustrative; no wedding date, venue, named guest or actual running order is asserted. The demo author is a revoked placeholder, so use an organiser to edit its examples.

After changing source:

```sh
docker compose build app
docker compose run --rm app npm run db:migrate:local
docker compose up -d app
```

## Tests and production build

```sh
docker compose --profile test build test
docker compose --profile test run --rm test
```

This applies the migrations to an isolated PostgreSQL 17 `wedding_test` database, runs database-backed integration checks, and runs Chromium browser checks against the built application. The test database uses tmpfs, has different credentials, and is never the local planning or live database. Tests refuse non-test database names/environments. Browser screenshots, traces on failure, a printable PDF and an HTML report are written under the ignored `test-results/` directory.

The critical checks cover atomic offers, downstream rollback, capacity races, claim/archive and claim/capacity races, request retries, duplicate self-volunteering, nominations, permissions, record revisions, recovery and revocation, duration cascades, draft approval, organiser-only reordering, schedule conflicts, midnight boundaries, archiving/restoration, uploads, export privacy, preview media isolation and access throttling. Browser checks cover separate browser identities, timezone independence, My jobs, nominations, failed-save drafts, conflicts, uploads, printing, centred layout, a scrollable non-modal panel, live timing previews, drag-and-drop, keyboard reordering, shared draft approval and polling. See `IMPLEMENTATION.md` for the actual verification results and limits.

```sh
docker compose exec app npm run build
docker compose exec app npx tsx scripts/verify-persistence.ts prepare
docker compose up -d --force-recreate app
docker compose exec app npx tsx scripts/verify-persistence.ts check
```

Wait for `app` to be healthy between recreation and `check` (`docker compose ps`). This optional local smoke check saves an activity, job, assignment and uploaded image through HTTP, then verifies the session, records and identical image bytes after recreation. It removes only its own fixtures after success. It does not contact Netlify.

## Supported Netlify local development

Use Node 22 and the committed dependency lockfile:

```sh
npm ci
node scripts/create-local-env.mjs
npm run dev
```

In a second terminal, while Netlify Dev is running:

```sh
npx netlify database migrations apply
```

Netlify Dev provides the local PostgreSQL-compatible database and Blobs emulator. Leave `APP_ENV`, `LOCAL_DATABASE_URL` and `LOCAL_MEDIA_DIR` **unset** in this workflow; they are Docker-specific. Its data is separate from the Docker volumes. The API uses Netlify's supplied connection string through `getConnectionString()` and one `pg.Pool` connection per transaction. `npm run dev:frontend` alone starts only Vite and does not supply the backend. Stop the Docker app first if it is using port 8888. The dev script uses IPv4-first DNS resolution to avoid the current emulator binding `localhost` to IPv6 while advertising an IPv4 connection. If invoking the CLI directly, use `node --dns-result-order=ipv4first node_modules/netlify-cli/bin/run.js dev`.

Production HTML includes a strict same-origin content-security policy generated at build time; Vite development omits that policy so its refresh preamble and injected styles can run. Framing and MIME-sniffing restrictions remain in `netlify.toml`.

The official [Netlify local workflow](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/) requires explicit local migration application. For a clean build, use `npm run build`; it type-checks frontend, backend, tools and tests, then produces `dist/`. On Windows use `npm.cmd` / `npx.cmd` if execution policy blocks the PowerShell wrappers.

## Prepare and deploy to Netlify

No site has been published, account plan changed or remote repository created by this implementation. Obtain the owner's deployment instruction before performing these external steps.

1. Create a Git repository for these files and connect it to the chosen Netlify site. Do not add `.env`, local volumes, test results or `.netlify/`. The build is `npm run build`, the publish directory is `dist`, the Functions directory is `netlify/functions`, and the runtime is Node 22. `netlify.toml` routes `/api/*` before the SPA fallback and sets privacy/security headers.
2. Verify **in that account** that Netlify Database is available on its plan and that its current usage limits are suitable. The official [database documentation](https://docs.netlify.com/build/data-and-storage/netlify-database/) describes account availability; no account was supplied here to verify it. If unavailable, record the setup problem before choosing another PostgreSQL service. This repository implements one PostgreSQL data model, not multiple providers.
3. Provision/link Netlify Database to the site through Netlify's Database setup. When using the CLI, authenticate and link the intended site (`netlify login`, `netlify link`), then follow the current `netlify database init` prompts. Keep the existing schema and **decline sample migrations/data**. Inspect any generated changes. Confirm the project's database connection in the Netlify dashboard. Use the platform-supplied database connection for each context; never manually set `NETLIFY_DB_URL` or substitute a production connection in previews.
4. Set a strong `ORGANISER_CREDENTIAL` as a **server-only Function environment variable**. Guests need no credential. Set different values for production and deploy previews/branch deploys. Do not use a `VITE_` prefix. Do not copy local test credentials. Never set the Docker-only variables on Netlify. The Function uses Netlify's trusted `context.deploy` to select its media namespace; media access fails closed in a non-production context without a deploy ID.
5. Netlify applies `netlify/database/migrations/*` at publication and to isolated preview database branches. Do **not** run `db:migrate:local` in hosted builds, add SQL to a build script, or run these migrations a second time. The [native migration workflow](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/) owns production tracking. The Docker migration runner uses its own `local_migrations` table and rejects hosted environments.
6. Confirm Netlify Blobs is available to the site's Function. No public bucket or external storage credentials are needed. Production uses the durable site-wide `wedding-production` store. Every preview deployment uses `wedding-preview-<DEPLOY_ID>`; a preview refuses to read production image metadata copied into its database branch. These pictures show the fallback. New previews use new media namespaces; production uploads survive redeployments.
7. Before release, use an authorised deploy preview to check real Functions routing, secure cookies, two-browser sharing, upload retrieval and a redeploy. Verify the preview database is its assigned branch and the preview cannot write to production. These account-specific checks cannot be replaced by the Docker results. Restrict preview access appropriately: native preview database branches may contain copies of production participant names and records.
8. Publish only after the owner instructs it. Open the live site as organiser and configure the actual date/venue when known. Production has no demo seeding or data reset on startup. Roll back code independently of data; use backwards-compatible future schema migrations.

## Using the timeline

- Participants add activities from **Add before** or **Add activity** between entries. Choose a duration preset or a custom number of minutes; no clock time needs to be remembered. The right panel keeps the timeline visible and scrollable, with a live unsaved preview. On phones it becomes a collapsible bottom panel. Jobs and nominations remain available from each activity. The “I’ll take care of this” and “I’ll do this” options explicitly create a responsibility assignment in the same transaction.
- New activities appear as **Draft - awaiting organiser**. Their duration immediately reserves time in the shared planning schedule. Organisers use **Confirm activity** or explicitly confirm while saving; confirmation does not shift times again. Participants can edit their own descriptive information and draft durations. Organisers control confirmed timing.
- Each participant can edit their own entries and nominations. Display names never establish identity; two people using the same name remain separate. Organisers can manage everyone's contributions.
- Linked insertions push subsequent linked activities later by the new duration, stopping at the next fixed start or another planning day. Duration edits shift them by the difference. Existing gaps are retained; a relative insertion clears an overlap at its insertion point if necessary. Only organisers can shuffle existing activities using **Move** to drag to a before/after gap, **Move up/down**, or the panel placement selector. Moving closes the old duration and reserves it at the new position.
- **Start at a particular time** lets any permitted activity editor choose a clock start and duration. **Keep this start time fixed** preserves an appointment and gaps when earlier activities change. **Move with the running order** opts into chaining. Inserting immediately before a fixed appointment uses the available time before it. Changes that overrun the next fixed appointment are rejected atomically with an explanation.
- Organisers use **Change start time** beside the wedding start (or Wedding settings). It defaults to **2:00 pm** and shifts the opening linked chain by the difference, stopping at the first fixed appointment. Fixed appointments and Before/After plans do not move.
- **Before**, **Wedding day** and **After** are separate, bookmarkable pages. Choose how many days away a task happens, from 1 to 365: for example collect tables 3 days before and return them 5 days after. Each day has its own running order. When the wedding date is set, calendar dates appear automatically. Linked overnight activities stay on the planning day they belong to, with their actual next-day clock labelled. Untimed tasks keep their selected planning day.

- My jobs opens beside the timeline and returns to the same scroll position. It includes managed nominations and expanded instructions.
- Polling runs every 30 seconds only while visible, online and recently interacted with (within two minutes). Focus/manual refresh/successful saves fetch current data. Idle use has no keepalive worker. Draft forms keep their text through refreshes and failed saves. Conflicts offer an explicit review/reload of newer content.
- Archive confirmations explain affected jobs/helpers. Non-organisers cannot archive someone else's active jobs or retained assignments. Only the selected record's archival flag changes; archiving an activity also moves later activities earlier by its duration. Restoring reserves that time again. Organisers restore activities before independently archived child jobs; withdrawn assignments remain withdrawn.
- Images accept still JPEG, PNG and WebP up to 2 MB and 25 megapixels. The backend checks signatures and decoded format, strips metadata, corrects orientation and resizes to at most 384 pixels before WebP storage. Uploaded pictures use browser-session routes, accessible to automatically admitted guests; they are not restricted to an invitation-code audience.
- The menu provides printing, private return-code management, and organiser settings, archives, access revocation and JSON export. Print uses the browser's PDF capability and includes the selected page, instructions, roles and names.

Migrations preserve existing activity clocks and data; the multi-day migration keeps their linked timing behaviour. The earlier dynamic-timeline migration preserves existing start times and marks existing entries confirmed. Old explicit end times supply durations; otherwise the next later start supplies an **estimated** duration (15 minutes if none). An organiser can adjust the estimate. Fresh demonstration entries remain drafts.

## Access and recovery

Sessions last 30 days and use random 256-bit opaque tokens. Only SHA-256 token hashes are stored. Production uses a `__Host-` cookie with Secure, HttpOnly, SameSite=Strict and path `/`; local HTTP uses an equivalent non-Secure local cookie. Authenticated writes require the exact origin, a custom request header and the session's CSRF token. Access attempts are limited by hashed IP in PostgreSQL (30 per 15 minutes); writes are limited by participant (120 per minute), shared across Function instances. At a venue with a single shared internet connection, stagger large groups joining if that access limit is reached.

Guests receive a browser session automatically. No guest account or shared access code is required. The timeline, contributions and uploaded pictures are available to visitors to the site. Ownership and organiser permissions are still enforced on the server; a display name never grants extra rights. Only organiser credentials can use the sign-in endpoint.

The optional **personal return code** in **Your name & contributions** restores ownership in another browser. Only its hash is stored, and generating a replacement invalidates the previous code. Organisers' return codes also restore organiser rights. Guests can simply keep using the same browser without ever generating a code.

Revoking an identity invalidates its sessions and recovery code while retaining contributions. A new browser can receive a new guest identity; revocation is not a ban on a person. Organisers can manage preserved contributions when a guest loses both their browser cookie and an optional return code.

## Data integrity and operational limits

Every business mutation checks out one PostgreSQL connection, begins a transaction and locks the singleton wedding row before checking current identity, ownership, capacity, revision and parent state. This deliberately serialises writes for one small wedding; readers use a consistent read-only snapshot. Descriptive-edit conflicts remain per record. Timing changes additionally check `wedding.schedule_revision` so a stale preview cannot shuffle a newer schedule. The shared schedule calculation drives both the preview and the backend transaction. The active self-assignment has a database uniqueness constraint. No external image upload is performed for an already completed retry.

Client-created request IDs and payload fingerprints are saved with each committed mutation. Retrying the same ID/content returns the saved result; changing content needs a new ID. These records are retained so a delayed retry cannot recreate contributions. Expired sessions/rate-limit rows are cleaned during ordinary writes, with no scheduled worker. Activity/job/assignment ownership always comes from the authenticated session.

The aggregate API is bounded to the application limits: 500 activities, 2,500 jobs, 10,000 assignment records (including withdrawn history), 2,000 identities, 1,500 uploads, and at most 100 helpers per job. Creation stops with an actionable error at the limits rather than silently truncating data. These are ample single-wedding limits; inspect usage before increasing them. Unattached uploaded images can remain if someone cancels after uploading or a transaction fails after writing the blob. Retain them until a reviewed backup/cleanup; the application never deletes production media during deployment.

## Backups and recovery

Organiser **Export schedule (JSON)** includes schema version, export time, settings, all active/archived activities and jobs, active/withdrawn assignments, display names and image IDs. It excludes access credentials, session tokens, token hashes and recovery hashes. It is a portable reference, not a complete database restore or image archive.

For a full hosted backup:

1. Use Netlify Database's **Backup and recovery** controls and confirm retention for the account. For an independent SQL snapshot, use the provider's secure connection workflow and `pg_dump` (custom format); keep the resulting dump private because it contains identity/session hashes. Restore only to a new, verified target with `pg_restore`, inspect it, then intentionally switch the application connection. Do not restore over a live timeline as a routine code rollback.
2. Export the production site's `wedding-production` Blobs store using the Netlify Blobs SDK/CLI with an authorised site-scoped credential. The SDK supports `getStore({ name, siteID, token })`, paginated `list`, and `get(key, { type: 'arrayBuffer' })`. Preserve blob keys and the database `images` table together. Alternatively download each referenced `/api/images/<image_id>` using an organiser session for a media copy alongside the JSON export; that does not include unattached uploads.
3. Test restoration on an isolated database and non-production store. Retain the exact mapping between `images.id`, `storage_key`, namespace, content type and bytes. Store SQL/media backups encrypted in an owner-controlled destination. Credentials must be entered privately, never committed or placed in command logs.

For Docker, back up both named volumes while writes are stopped, or use `pg_dump` in `db` plus a copy of the `media` volume. A database-only snapshot omits image bytes.

## Costs and maintenance

No plan or billing changes have been made. Choose the minimum database compute tier appropriate for this small application and **sleep after five minutes of inactivity** where the account supports it. Confirm the selected setting in the Netlify Database dashboard; the repository cannot configure or verify account billing. Monitor database compute/bandwidth, Blobs storage/requests, Functions and deploy usage in Netlify's usage/billing screens. No free service or fixed monthly cost is promised. Refer to the current [billing and usage information](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/), rather than relying on a static price estimate.

Dependencies are locked. Update intentionally and rerun Docker checks; do not blindly accept `npm audit fix --force` downgrades. Current audit details are recorded in `IMPLEMENTATION.md`.

## Repository map

| Location | Purpose |
| --- | --- |
| `src/` | Responsive timeline, forms, session UI and refresh behaviour |
| `shared/` | Types, clock formatting, ordering and request validation |
| `server/` | API, authentication, PostgreSQL transactions and private media |
| `netlify/functions/api.ts` | Hosted Function entry point |
| `netlify/database/migrations/` | Native versioned SQL migrations |
| `scripts/` | Local migration, explicit demo seed and persistence check |
| `tests/` | PostgreSQL integration and browser acceptance checks |
| `public/illustrations/` | Small original SVG illustrations |

The illustrations are original geometric SVGs generated by `scripts/illustrations.mjs`; no external artwork, fonts, trackers or image services are requested. System fonts provide the typography. See `THIRD_PARTY_NOTICES.md` for dependency notices.
