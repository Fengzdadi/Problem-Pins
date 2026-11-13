# Architecture and module plan

How the prototype is put together, the contracts the parallel modules build against, and who
owns which files. Read this before changing anything shared. The phases and team decisions live
in the GitHub issues (Kickdapie/Problem-Pins #1 roadmap, #2 checklist).

## Layers

```
screens (src/resident, src/org)
   │  useStore()
   ▼
store (src/store.tsx)          holds the latest Snapshot, reloads after every mutation,
   │  Backend interface         turns errors into toasts, tracks analytics for actions
   ▼
src/backend/types.ts  ◄── the contract
   ├── demo.ts                  sample data in localStorage, date frozen at 2026-10-14
   └── supabase/                shared Postgres + Auth + Storage + Realtime (live mode)
```

Screens never call a backend directly. Everything goes through `useStore()`. Store actions return
`Promise<boolean>` (true = saved) and never throw, so a screen can do
`if (await assign(id, team)) toast('Assigned')`.

## Modes

| | demo | live |
|---|---|---|
| Data | `src/data/sampleData.ts`, saved in this browser | Supabase, shared by everyone |
| Date | frozen at `DEMO_TODAY` (2026-10-14) | today in New York |
| Staff | any email signs in as Maya Ruiz | real Supabase Auth accounts |
| Demo bar, SAMPLE DATA badge | shown | hidden |

`src/config.ts` picks the mode: live when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set,
otherwise demo. `?mode=demo` in the URL (before the `#`) forces the demo on any deployment, for
presentations. Two demo tabs stay in sync through `storage` events.

## Conventions

- **Dates** in the domain model are New York calendar dates, `YYYY-MM-DD`. Use `today()`,
  `daysBetween()`, `nyDate()` from `src/lib/format.ts`; never `new Date()` for display logic.
  Analytics events carry full ISO timestamps (`at`).
- **IDs**: the backend generates issue IDs (`PP-2461`, ...). Scan point codes (`Q-12`) are printed
  on posters, so they are never reused.
- **Counts** (`votes`, `votesThisWeek`, `following`, `confirmedFixed`, `duplicatesMerged`) are derived
  by the backend from records. The UI only shows them.
- **Errors**: backends reject with an `Error` whose message is safe to show to a resident.
- **Hidden and merged issues**: `store.issues` excludes them; `store.hiddenIssues` (staff) has them;
  `store.getIssue(id)` finds any issue the viewer may see, so old links to a merged pin redirect.
- **Privacy**: no personal data in analytics events. Follow contacts (email/phone) are stored but
  never returned by `load()`. Photos are re-encoded through a canvas, which strips EXIF/GPS.
- **District**: everything district-specific (name, area, boundary, teams, attention rules,
  categories) comes from `store.district`. Don't hard-code "West Side District" or "West Chelsea".
- **Analytics**: the store tracks resident and staff actions centrally. Screens only track views
  (`map_view`, `scan_view`, `issue_view`, `pin_start`). Event names are a union in `types.ts`.
- **Routing** is hash-based (`#/i/PP-2402`). Printed QR codes use a short path (`/q/Q-12`), which
  `src/router.ts` rewrites to `#/scan/Q-12?src=qr`; the host must serve `index.html` for `/q/*`.

## Routes

| Route | Screen | Owner |
|---|---|---|
| `#/` | `resident/MapHome` | location |
| `#/i/:id` | `resident/IssueDetail` | (shared, wave 2: notifications) |
| `#/new?cat=&from=` | `resident/NewPin` | location |
| `#/scan/:code?src=` | `resident/ScanLanding` | qr-analytics |
| `#/updates` | `resident/Updates` | (shared, wave 2: notifications) |
| `#/org` `#/org/issues/:id` `#/org/map` `#/org/sent` | `org/*` | staff-app |
| `#/org/reports` | `org/Reports` | qr-analytics |
| `#/org/qr` | `org/QrPosters` | qr-analytics |
| `#/org/login?next=` | `org/Login` | staff-app |

All `#/org/*` routes except login are wrapped in `org/RequireStaff` (staff-app).

## Modules and file ownership

Wave 1 runs in parallel, one git worktree and branch per module, all cut from `live-prototype`.
A module only edits the files it owns. If it truly needs a change in a shared file, it keeps the
change small and additive and lists it in its final report.

| Module | Owns | Dev server |
|---|---|---|
| **backend** (Supabase) | `supabase/**`, `src/backend/supabase/**`, `scripts/` seed tooling, `docs/BACKEND.md` | `pp-backend` :5181, local Supabase :54321 |
| **staff-app** | `src/org/**` except `Reports.tsx` and `QrPosters.tsx` | `pp-staff` :5182 |
| **location** | `src/resident/MapHome.tsx`, `src/resident/NewPin.tsx`, `src/components/IssueMap.tsx`, `src/data/geo.ts`, `src/data/demoDistrict.ts`, new `src/lib/` location/geocoding/geometry files | `pp-location` :5183 |
| **qr-analytics** | `src/org/QrPosters.tsx`, `src/org/Reports.tsx`, `src/resident/ScanLanding.tsx`, new `src/lib/` QR/metrics/CSV files, demo event seed, short-link host config (`vercel.json`, `public/_redirects`) | `pp-qr` :5184 |

Shared files (the contract; additive changes only, mentioned in the report):
`src/data/types.ts`, `src/backend/types.ts`, `src/backend/demo.ts`, `src/store.tsx`, `src/App.tsx`,
`src/router.ts`, `src/config.ts`, `src/components/ui.tsx`, `package.json`, `.env.example` (append
your own section).

Wave 2, after wave 1 is merged: email notifications (Supabase Edge Function + Resend, real "Notify
me", unsubscribe), accessibility and language access (Spanish, Chinese), deployment (hosting,
domain, staging and production Supabase projects, privacy page), spam protection (Turnstile).

## Working on a module

```
npm install
npm test            # Vitest
npm run build       # typecheck + production build
```

- Preview with your module's launch config (`.claude/launch.json`), never the default port, so
  parallel sessions don't collide.
- Commit to your module branch. Don't push: merging into `live-prototype` happens locally after review.
- Keep the demo working. Every feature must behave sensibly in demo mode without Supabase.
- Style: follow the existing look (orange `#ef5a1f`, ink `#141b2d`, mono labels for IDs and section
  headers, honest status copy). No gradients, emoji or decorative filler.
- The instructor's rule: product code is fair game, but experiment thresholds and analysis belong
  to the team. Leave them as clearly marked settings for the team to fill in, never invented numbers.

## Decisions so far

- Backend: Supabase. Residents get an anonymous Supabase identity per device (one vote per device),
  staff sign in with email and password.
- Analytics: our own `events` table, no third-party tracker.
- Hosting, domain, map tile provider, budget: still open (see roadmap issue #1).
