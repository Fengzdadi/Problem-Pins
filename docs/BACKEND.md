# Backend (Supabase)

Live mode runs on Supabase: Postgres for the data, Auth for identities, Storage for photos and
Realtime for change pings. The browser talks to it through `src/backend/supabase/`, which
implements the `Backend` contract in `src/backend/types.ts`. The database side is in
`supabase/migrations/`.

## Run it locally

You need Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```
supabase start          # first run pulls the images; prints URLs and keys
supabase status         # prints them again
```

Create `.env.local` (never committed):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<the Publishable key from `supabase status`>
VITE_DISTRICT_ID=west-side-demo
```

Then `npm run dev` (or the `pp-backend` launch config, port 5181). The app is in live mode: no demo
bar, real dates, shared data.

- **Staff sign-in** (local only): `#/org/login` with `maya@westside.example` / `problem-pins-local`.
  The account comes from `supabase/seed-local-staff.sql`.
- **Start over**: `supabase db reset` reapplies the migrations and both seed files.
- **Look at the data**: Studio at http://127.0.0.1:54323.
- **Stop**: `supabase stop` (data is kept until the next reset).

To try a second resident on the same machine, open the app on another origin
(`http://[::1]:5181` next to `http://localhost:5181`) or in a private window. Each origin gets
its own anonymous identity.

## How it works

**Identities.** Residents never make an account. On first load the app signs the device in
anonymously, which gives it a stable user id; that is what makes "one +1 per device" work.
Staff sign in with email and password and have a row in `staff` for their district. When staff
sign out, the device gets its resident identity back (the app keeps its refresh token aside while
staff are signed in).

**Reads.** `get_snapshot(district)` returns everything the app shows in one call: the district,
its issues with updates and history, scan points, and what this device has done. Counts are
derived from records here, not stored: `votes`, `votesThisWeek` (votes on the last 7 New York
calendar days, today included), `following`, `confirmedFixed` and `duplicatesMerged` (issues
whose `merged_into` points here). Hidden issues are left out unless the caller is staff of that
district. The reporter's user id is never returned, only whether the issue is "mine".

**Writes.** Every mutation is a Postgres function (RPC): `create_issue`, `vote`, `follow`,
`comment`, `confirm_fix`, and for staff `post_update`, `set_status`, `assign`, `send_to_city`,
`nudge_city`, `hide_issue`, `unhide_issue`, `merge_issue`, `save_scan_point`,
`delete_scan_point`, `list_events`. They run as `security definer` with a fixed `search_path` and
check the caller themselves. Messages they raise are written for residents and shown as they are;
any other database error becomes "Something went wrong. Please try again."

**Row level security** is on for every table. Residents and anonymous callers have no direct
write access to anything except inserting analytics events. Staff can select their own
district's rows; a resident can select only their own votes, follows and confirmations.
`follow_contacts` (emails and phone numbers from "Notify me") has no policies at all, so only the
service role can read it.

**Realtime.** A trigger on issues, updates, history, votes, follows, confirmations, city requests
and scan points sends one empty broadcast per district per transaction on the public topic
`district:<id>`. Clients reload their snapshot when it arrives, so nothing private goes over the
socket and RLS still decides what each viewer sees (a hidden issue disappears for residents).

**Photos.** Bucket `photos`, public read. JPEG, PNG or WebP up to 5 MB, uploaded into a folder
named after the device's user id, at most 20 per hour per device. The browser re-encodes photos
through a canvas first, which drops EXIF and GPS. Public URLs don't expire, so a photo stays
reachable by its URL after its issue is hidden; switching to signed URLs is possible later but
would need the snapshot to sign every photo URL.

**Rules the database enforces** (in `20261113000001_functions.sql`): pins must be inside the
district boundary and in one of its categories, titles 3 to 120 characters, up to 4 photos that
were uploaded to our bucket, 10 pins and 20 notes per device per hour. `send_to_city` needs the
real 311 SR number. Scan point codes are never reused: deleting one retires it, and saving a
retired code is refused.

**Analytics.** Events go into `events` with the device's user id, so unique devices can be
counted later. `list_events` never returns that id.

## Seed data

`supabase/seed.sql` is generated from the demo's sample data:

```
npm run db:seed-sql     # rewrites supabase/seed.sql
supabase db reset       # loads it
```

Dates are written relative to the day the seed runs: the sample's "today" (2026-10-14) becomes
today in New York. The sample counts become records: anonymous votes, follows and fix
confirmations spread over each issue's life, and five merged duplicate reports behind PP-2402.
Votes can't predate the pin, so issues pinned less than a week before "today" show all their votes
as this week (PP-2440, PP-2447 and PP-2449 differ from the demo there).

## Tests

`npm test` includes `src/backend/supabase/supabase.integration.test.ts`, which runs against the
local stack when `supabase status` finds it running and skips otherwise (set
`SKIP_SUPABASE_TESTS=1` to skip anyway). It creates two throwaway districts with their own staff
and removes them afterwards, so the sample data is untouched. It covers RLS (no hidden issues or
contacts for residents, one vote per device, no staff actions for residents, no cross-district
staff access) and the main RPCs, uploads and Realtime.

## Staff accounts

Staff rights come only from the `staff` table. Supabase can't turn off email sign-ups without
also turning off anonymous sign-ins, so anyone could create an email account through the API, but
without a `staff` row it is just another resident and the staff app refuses it. Staff accounts are
created by someone with access to the Supabase dashboard:

1. Authentication → Users → Add user → Create new user. Enter their email and a temporary
   password, tick "Auto confirm user".
2. SQL editor:

   ```sql
   insert into staff (user_id, district_id, name, role)
   select id, 'your-district-id', 'Maya Ruiz', 'Operations manager'
   from auth.users where email = 'maya@example.org';
   ```

To remove someone, delete their `staff` row (and the user, if they have no other district).
A user with no `staff` row for the deployment's district can't sign in to the staff app.

## A new district

Insert a row into `districts` (Studio or SQL). `boundary` is a GeoJSON Polygon or MultiPolygon in
`[lng, lat]` order; `rules` uses the `AttentionRules` keys from `src/data/types.ts`. Then set
`VITE_DISTRICT_ID` to its `id` in that deployment's environment.

## Hosted projects

Use two projects: **staging** (sample data, for the team and demos) and **production** (the
pilot, real data only). For each one:

1. Create the project in the Supabase dashboard (US East is closest to New York).
2. Apply the migrations from this repo:

   ```
   supabase link --project-ref <project ref>
   supabase db push
   ```

   Run `supabase db push` again whenever a new migration lands. Never edit a migration that has
   been pushed; add a new one.
3. Authentication settings: allow new sign-ups and anonymous sign-ins (residents need both), keep
   the email provider on (staff), and set the Site URL to the deployment's URL. Under Rate limits, the default of 30
   anonymous sign-ins per hour per IP address is low if many residents share one network (an
   event, a library). When it is hit, those devices can still read but can't +1 or pin.
4. Leave public Realtime channels allowed (the change pings use them).
5. Staging only, load the sample once:

   ```
   psql "<connection string>" --single-transaction -v ON_ERROR_STOP=1 -f supabase/seed.sql
   ```

   Don't use `supabase db push --include-seed`: it would also run `seed-local-staff.sql`, whose
   password is in this repo.
6. Create staff accounts as above, and set the deployment's environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` = the publishable key, `VITE_DISTRICT_ID`).

**Free tier.** Free projects are paused after about a week without activity. A paused project
answers nothing until someone restores it from the dashboard, which takes a few minutes; a resident
scanning a poster in the meantime gets an error page. Free projects also have no backups. Staging
on the free tier is fine; production for a paid pilot should be on a paid plan.

## Open decisions

- Hosted projects: who owns them, which plan for production.
- Email provider for notifications (wave 2). Follow contacts are already stored, privately.
- Photos: public bucket (current) or signed URLs.
- Analytics keep the anonymous device id; the privacy page should say so, or we drop it.
- Rate limits (pins, notes, uploads per hour, anonymous sign-ins per IP) are first guesses.
- Old anonymous users pile up in Auth. Deleting them is safe for counts (votes don't reference
  `auth.users`), but those devices would lose their "my +1s" list.
