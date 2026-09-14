# The Larder

Recipe builder, 7-day meal planner, and shopping list. Next.js (App Router) + Supabase, single-user, no auth.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your project and run the contents of `supabase/schema.sql`.
3. **Get your keys**: in Project Settings → API, copy the Project URL and the `service_role` secret key.
4. **Set env vars**: copy `.env.local.example` to `.env.local` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a `SITE_PASSWORD` of your choosing (see below).
5. **Run it**:
   ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

The service role key is only ever read in server-side code (`lib/supabase/server.ts`, used by Server Components and Server Actions in `app/actions.ts`) — it's never sent to the browser. There's no login: all data in the database belongs to whoever can reach the deployed URL, which is the intended single-user setup.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the same environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_PASSWORD`) in the Vercel project settings — make sure each is enabled for the **Production** environment, not just Preview/Development.
4. Deploy.

## Architecture notes

- **Data model**: `recipes` (ingredients stored as a `jsonb` array on the row), `meal_plan` (one row per date+slot, upserted), `shopping_list_items` (fully replaced each time you rebuild the list from the meal plan).
- **No RLS policies**: all three tables have row-level security enabled with zero policies, which blocks the anon/public key entirely. Only the service role key (server-side only) can read or write.
- **Client/server split**: `app/page.tsx` is a Server Component that fetches everything up front; `components/LarderApp.tsx` is a Client Component holding UI state, calling the Server Actions in `app/actions.ts` for every mutation and updating local state from the result (optimistic where it's cheap to roll back, e.g. meal-plan assignment).
- **Password gate**: `proxy.ts` (Next.js 16's replacement for `middleware.ts`) redirects every request without a valid `site_auth` cookie to `/login`, except `/login` and `/api/login` themselves. The cookie is an HMAC of a fixed payload keyed by `SITE_PASSWORD` (`lib/site-auth.ts`) — `HttpOnly`, 10-year expiry, so it survives as long as the browser doesn't clear cookies. There's no per-user session to revoke; changing `SITE_PASSWORD` invalidates every existing cookie at once, since they were signed with the old value.

## Adding another app on the same Supabase project

Other single-user, no-auth apps under `biffsmidgeon.com` (their own GitHub repo and Vercel project) can share this same Supabase project instead of provisioning a new one — Supabase bills per project, and there's nothing here that requires isolation beyond separate tables. Each new app just needs to follow the same pattern this one uses:

1. **Pick table names that won't collide** with this app's (`recipes`, `meal_plan`, `shopping_list_items`, `ingredients`, `daily_extras`) or any other app already on the project. Prefixing by app (e.g. `budget_transactions`) is the safest bet once there are a few apps in play.
2. **Enable RLS with zero policies** on every new table, same as here — this blocks the anon/public key entirely, so the only way in is the service role key from server-side code.
3. **Explicitly `grant` the new tables to `service_role`** — this is the step that's easy to forget. RLS and Postgres's `GRANT` system are two separate layers; enabling RLS doesn't grant table access, and Supabase does not always do this automatically for new tables. Skipping it is exactly what caused a "permission denied for table recipes" error the first time around here. The fix is the pattern already in `supabase/schema.sql`:
   ```sql
   grant usage on schema public to service_role;
   grant all on public.your_new_table to service_role;
   ```
4. **Copy the same two env vars** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) into the new app's own `.env.local` and its own Vercel project settings — same project, same keys, just duplicated into a separate deployment.
5. **Keep the service role key server-side only** in the new app too (a `lib/supabase/server.ts`-style helper, never imported from a `"use client"` file) — it bypasses RLS by design, so leaking it to the browser would expose every app sharing the project, not just the new one.
6. **Point a new subdomain at the new Vercel project** (e.g. `newapp.biffsmidgeon.com`), independent of this app's `larder.` DNS record.
7. **Set the repo's git identity to a GitHub-verified email before your first push.** Vercel blocks a deployment if its commit's author email isn't a verified email on the pushing GitHub account — this has hit every app set up so far. Fix: `git config user.email <your-github-verified-email>` and `git config user.name <name>` in the new repo (this only needs setting once per repo; it overrides your global git config for that repo only). No need to rewrite any commits made before you catch this — Vercel only checks the tip commit on a given push, not full history.
