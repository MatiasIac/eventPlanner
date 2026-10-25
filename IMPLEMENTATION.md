# Implementation and verification

Implemented from `requirements.md` on 25 October 2026. The application is prepared for Netlify and running locally in Docker. Nothing has been published and no external account or plan has been changed.

## Delivered

- A centred, normally scrolling timeline with consistent small illustrations, local wedding times, next-day entries, duration-based running order and a separate unconfirmed-time section. Date and venue start unset.
- Shared PostgreSQL persistence for activities, jobs, assignments, identities and sessions; shared draft activities with organiser confirmation; non-modal side-panel editing and live timing previews; organiser-only drag-and-drop and keyboard reordering; atomic activity/job offers; self-volunteering and managed nominations; My jobs.
- Server-enforced ownership and organiser permissions, revision conflicts, retry protection, capacity locking, soft archive/restore, access revocation and private return-code recovery.
- Validated and optimised private image uploads, Netlify Blobs integration, isolated preview stores, print/PDF layout and organiser JSON export.
- Native SQL migrations, explicit demo seed, locked dependencies, Docker app/test environments, Netlify Function/routing configuration, example server environment, original SVG assets and operating documentation.

The local instance retains its existing activities. The demonstration banner was removed at the owner's request. Its access codes are in the ignored `.env`. Production migration/startup does not create that sample schedule. No actual date, venue, guest list or wedding sequence has been invented.

## Checks actually run

| Check | Result |
| --- | --- |
| Docker build on Node 22.23.3, TypeScript check and Vite production build | Passed |
| PostgreSQL 17 migrations, including repeat application | Passed; previously applied migrations skipped; earlier upgrade preserved 8 activities; the guest/day upgrade preserved all 9 currently saved activities with an identical start-time fingerprint |
| Real PostgreSQL integration checks | **22 passed** |
| Chromium end-to-end checks against the built app in Docker | **9 passed** |
| Phone, tablet and desktop layout | Passed at 390, 768 and 1440 pixels; additional 320-pixel overflow check passed |
| Keyboard side-panel opening, Escape and restored focus | Passed |
| Print stylesheet and PDF generation | Passed; generated PDF under `test-results/` |
| App-container rebuild/recreation with persistent database/media volumes | Passed: session, activity, job, assignment and identical uploaded image bytes retained; verification fixtures removed |
| Actual Netlify Dev in Docker with native local database and Blobs emulators | Baseline verification before this scheduling update passed: migrations, Function routing, session, atomic offer, upload and authorised retrieval |
| Chromium through the actual Netlify Dev proxy | Baseline verification before this scheduling update passed: rendered UI, sign-in and atomic offer, without script/CSP errors |
| Netlify Function packaging (`netlify functions:build --src netlify/functions`) | Passed |
| Production dependency audit (`npm audit --omit=dev`) | **0 vulnerabilities reported** |

The database checks include final-place races, archive/capacity races, downstream rollback, concurrent identical retries, same-name identity separation, direct unauthorised API calls, stale edits, capacity reduction, draft confirmation, contextual before/after insertion, duration changes, organiser-only moves, stale structural changes, midnight cascades and atomic boundary rejection, retained archive descendants, recovery rotation/revocation, after-midnight ordering, upload spoofing/size limits, private exports, rate limits and preview media separation. Browser checks cover two-browser sharing and recovery, a visitor in another timezone, nominations/withdrawal/My jobs, failed saves and preserved drafts, background conflicts, pictures, organiser settings/archives/export, keyboard focus and visible/hidden/offline/idle polling. New browser checks exercise a non-modal desktop panel and collapsible phone panel, scrollable background, unsaved timing preview, shared draft approval, real mouse drag-and-drop, keyboard reordering and explicit review of a concurrent schedule change.

Visual artifacts are ignored local outputs: `test-results/timeline-390.png`, `timeline-768.png`, `timeline-1440.png`, `timeline-print.pdf`, `timeline-panel-desktop.png`, `timeline-panel-phone.png`, and `test-results/report/index.html`. Screenshots and PDF use test records, not the real wedding.

Final built frontend: approximately **275 KB JavaScript (85 KB gzip)** and **28 KB CSS (7 KB gzip)**, plus small bundled SVGs. No external font, tracking, stock-image or AI service is contacted by the application.

## Scheduling update

The owner's follow-ups supersede the original no-cascade/no-approval and mandatory guest-code defaults; requirements version 1.2 records the current behaviour. Drafts reserve time as soon as saved. Confirmation changes only their status. Inserts reserve their duration, duration edits shift by the difference, moves close the original slot and reserve the new one, and archive/restore removes/reinstates that duration. Specific clock starts now default to fixed appointments. Linked timing is an explicit alternative. Fixed starts stop cascades and preserve gaps; changes that overrun a fixed appointment fail atomically. Each planning day is independent.

The migration preserves existing start times and treats pre-existing activities as confirmed. Missing durations become clearly labelled estimates, derived from an explicit end or the next later start, with a 15-minute fallback. All changed records and the shared schedule revision commit together. Existing text-only edits retain per-record conflict checks. Test data remains isolated from the local planning database.

## Guest access, planning days and compact cards

Guests open the timeline directly without a name/code gate. A silent browser session preserves ownership; adding a name and generating a personal return code are optional. The sign-in endpoint is organiser-only. The unused shared guest credential was removed from runtime configuration. Existing guest/organiser sessions remain valid.

Before, Wedding day and After pages support exact offsets up to 365 days either side, plus calendar dates when the wedding date is set. Each activity retains its intended planning day across midnight. The configurable wedding start defaults to 2 PM; changing it moves the opening linked chain and preserves fixed appointments and other days. All activity editors retain start-time and duration controls, subject to the existing organiser-only relocation rule.

Helping-hand summaries combine title, capacity and status. Helpers and controls remain visible in compact rows; the Manage menu now shares the title row. The demonstration banner is removed without deleting any saved activities.

The final running app also passed a credential-free guest API check, returning the six active activities and the 14:00 wedding start (all nine records, including archives, were preserved).

New Docker checks verify credential-free guests, stable browser ownership, forbidden organiser actions, fixed-time boundaries and rollback, changed wedding start, independent multi-day tasks, exact dates and page persistence, compact card height, and phone overflow. Visual checks include compact-help-phone.png, before-page-phone.png and after-page-desktop.png in test-results/.

## Findings addressed during verification

- Upgraded Sharp to 0.35.5 after the initial dependency audit identified vulnerable native image libraries. Runtime dependency audit is now clean.
- Added the IPv4-first flag to `npm run dev`: the current Netlify emulator could bind localhost on IPv6 while advertising an IPv4 database/proxy endpoint in this Docker environment. Native migrations/API/browser checks passed after that adjustment.
- Generate the strict content-security policy in production HTML; omit it in Vite development so the refresh preamble and styles work. Production browser checks run with the policy enforced.
- Kept React timeline entries stable during background refreshes, improved small-text contrast, and included expanded job instructions in printed output.

## Remaining account-specific release checks

No Netlify account/site was provided. The owner must verify Database plan eligibility and usage, provision/link the site's database, set separate production/preview server credentials, and authorise deployment. See the numbered deployment steps in `README.md`.

An account-free `netlify build --offline` was attempted. Netlify CLI 27.14.2 / Build 37.6.1 fails in its database provisioning step (`createSiteDatabase` has no API client in offline mode). Frontend production build, standalone Function packaging, and native local emulation were verified separately. A full hosted build remains unverified until a site is linked; no credentials were requested and no provisioning was performed.

Real hosted secure cookies, branch isolation, durable production Blobs and deployment rollback/redeploy behaviour still need an authorised preview/live check. Local database/media persistence and the application's preview namespace guard are tested; these do not establish the state of a particular Netlify account. Cross-engine Firefox/Safari and an assistive-technology audit were not run.

The full dependency audit still reports **two high-severity development-tool findings**: `netlify-cli` and its transitive `toml` parser. They describe denial of service when parsing malicious TOML and are absent from the runtime audit. The locked current CLI has no compatible patched version offered by the audit; its suggested downgrade to CLI 5.3.1 would remove the required Database workflow and was not applied. Use trusted repository configuration and recheck when updating the CLI. See [the parser advisory](https://github.com/advisories/GHSA-9qmh-m7c6-f92p). This limitation is recorded rather than hidden by an audit exclusion.

See `README.md` for backup/restore steps, billing/sleep settings, explicit application bounds, and the possibility of unattached images from cancelled or interrupted uploads.
