# Collaborative planner

A small shared timeline built with React, TypeScript, Netlify Functions and PostgreSQL. Guests open it directly. Organisers sign in to manage settings, confirm activities and rearrange the schedule. The title is yours to set; there is no fixed event branding.

## Run with Docker

With Docker Desktop running Linux containers:

```sh
node scripts/create-local-env.mjs
docker compose build app
docker compose up -d db
docker compose run --rm app npm run db:migrate:local
docker compose up -d app
```

Open **http://localhost:8888**. The environment helper creates a private organiser credential in the ignored `.env` and preserves an existing file. Alternatively copy `.env.example` and set a random `ORGANISER_CREDENTIAL` of at least 16 characters. Host Node is only needed for the optional helper; Docker runs the application and builds.

Guests need no login, code or name. The person icon lets someone add a display name. Their browser cookie remembers contributions for 30 days. Organisers use **More options > Organiser sign in** with their name and organiser code.

PostgreSQL stays on Docker's private network; only localhost port 8888 is exposed. The named `database` volume survives container rebuilds and recreation. Keep this volume when stopping the stack. The existing Compose project and database names are retained for compatibility with saved plans. No media volume or Blob service is used.

After source changes, rebuild, apply migrations, then recreate the app:

```sh
docker compose build app
docker compose run --rm app npm run db:migrate:local
docker compose up -d app
```

Optional development examples: `docker compose exec app npm run db:seed`. Seeding refuses a non-empty schedule, never runs automatically and cannot run in production.

## Use the planner

- **Settings** contains Title, Date (optional), Venue (optional), Start time and Page theme. Choose **Beach**, **Night**, **Garden**, **Sunset** or **Lavender**; Beach starts with sand and ocean blue. The saved theme applies to every visitor and all forms. The configured title is the page heading and browser title. Changing the default 2 PM start shifts the opening linked activities; fixed appointments and other days keep their times.
- **Before**, **Main day** and **After** are bookmarkable pages. A task can be 3 days before or 5 days after, for example. Exact dates appear when the main date is set. Each day has an independent running order.
- Add from the timeline: **Add before** appears above the first activity, and **Add activity** appears between activities and at the end. Choose 5, 10, 15, 30, 45 minutes or another duration. The side panel keeps the schedule visible and scrollable and previews the proposed times. On phones it becomes a collapsible bottom panel.
- Specific clock starts preserve gaps by default. Choose linked timing to move with earlier activities. Linked additions reserve their duration and push later linked activities until a fixed start or another planning day. Changes that run into a fixed start are rejected with an explanation.
- Saved activities are shared drafts until an organiser confirms them with the tick icon. Confirmation does not shift times again. Guests edit their own descriptions and draft durations; organisers manage all entries and confirmed timing.
- Organisers drag the **whole card** before or after another activity. A line and label show the destination. On touch screens, hold briefly then drag; ordinary swipes still scroll. Keyboard users focus the card, press Space, choose with arrow keys, and press Enter to drop or Escape to cancel.
- Pencil and archive icons edit/archive activities and jobs. Nomination editing and withdrawal icons sit beside each person's name. Buttons have accessible names and hover labels.
- **I can help**, **Nominate someone** and **My jobs** support volunteering and managed nominations. Nominate all vacant places together, with one field per name; leave unused fields blank. The whole group saves together, while individual names remain editable. An activity/job offer can save its responsibility assignment in the same transaction.
- Choose from **24 bundled icons** in a visual grid. **A few helpful details** has bold, italic and bullet-list buttons, with formatting retained for everyone and in print. There are no uploads, alternative-text forms, recovery codes, participant administration, JSON export or timezone controls.
- **Print timeline** uses the browser's print/PDF support. **Archived entries** lets organisers restore records while retaining jobs and assignments.

Clock times remain identical for everyone, independent of the browser's timezone. Drafts participate in scheduling immediately. Reloading in the same browser retains ownership; another browser is a separate guest identity. Organisers can edit any contribution.

Saving checks record revisions and schedule revisions. Conflicts preserve unsaved text for review. Polling runs every 30 seconds while visible, online and recently active; it stops while idle, hidden or offline. No background worker is needed.

## Docker checks

```sh
docker compose --profile test build test
docker compose --profile test run --rm test
```

The test service applies migrations and runs PostgreSQL integration tests plus Chromium browser tests against the production build. It uses a separate tmpfs database with separate credentials. Tests refuse non-test database names/environments. Screenshots, a printable PDF, failure traces and the HTML report are under the ignored `test-results/` directory. See `IMPLEMENTATION.md` for results.

Coverage includes collaboration, guest/organiser permissions, atomic offers and group nominations, capacity races, retries, conflicts, safe formatted details, shared themes, draft approval, duration cascades, fixed appointments, multi-day tasks, mouse/touch/keyboard dragging, archive restoration, responsive layouts and printing.

## Netlify development and deployment

For Netlify's local emulator, use Node 22 and the lockfile:

```sh
npm ci
node scripts/create-local-env.mjs
npm run dev
```

While it runs, apply local native migrations in another terminal with `npx netlify database migrations apply`. Stop the Docker app first if it occupies port 8888. Leave `APP_ENV` and `LOCAL_DATABASE_URL` unset in this workflow; they select the Docker adapter. The emulator database is separate from Docker data. The dev script selects IPv4-first DNS for the local proxy/database. `npm run dev:frontend` alone does not run the backend.

The repository is prepared for a Netlify site with build command `npm run build`, publish directory `dist`, Functions under `netlify/functions`, and Node 22. `netlify.toml` routes API requests before the SPA fallback. Production HTML contains a same-origin content-security policy; development permits Vite's refresh scripts.

Before a hosted release:

1. Link the intended repository/site and provision Netlify Database. Verify availability and usage limits in that account. Keep the repository's existing schema instead of adding sample migrations.
2. Set `ORGANISER_CREDENTIAL` as a server-only Function environment variable, separately for production and previews. Never prefix it with `VITE_` or use test credentials.
3. Use Netlify's supplied database connection for each deployment context. Do not override previews with a production connection. Netlify tracks `netlify/database/migrations/`; do not run the Docker migration runner in hosted builds.
4. Verify the authorised preview's routing, secure cookies, two-browser sharing, database branch isolation and persistence through redeployment.
5. Deploy the changes to the intended site. These updates have been prepared and verified locally; this session has not changed the hosted deployment.

The application uses Netlify Database and Functions only; it does not require Blob storage. Existing unused legacy columns and media files are retained during upgrade to avoid deleting historical data. The application no longer reads or writes uploaded media.

The themes and formatted-details update needs **no new environment variables**. Include `netlify/database/migrations/202610250006_details_and_themes.sql` in the deployment. It adds the shared theme and nullable formatted-description column without rewriting existing activities, jobs or assignments. Earlier migration files must remain unchanged.

## Maintenance

Back up PostgreSQL with the provider's database backup tools or `pg_dump` for Docker. Store backups privately and verify restoration on a separate database. A code rebuild never seeds or resets planning data.

Bounds: 500 activities, 2,500 jobs, 10,000 assignments and 2,000 identities; 100 helpers per job; titles 120 characters, descriptions/instructions 1,200; durations 1-1,440 minutes; planning dates up to 365 days either side. API requests are limited to 64 KB to accommodate formatting, with formatted documents capped at 400 nodes and eight nesting levels. Archived records count towards bounds.

Monitor database, Functions and deployment usage in the account. There are no scheduled warmups or paid image services. Costs and account eligibility are not established by local tests.

Dependencies are locked. Update intentionally and rerun Docker checks. Source lives in `src/`, shared scheduling/validation in `shared/`, backend in `server/`, migrations in `netlify/database/migrations/`, and checks in `tests/`. Bundled SVGs are original; see `THIRD_PARTY_NOTICES.md`.

