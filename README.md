# The Larder

Recipe builder, 7-day meal planner, and shopping list. Next.js (App Router) + Supabase, single-user, no auth.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your project and run the contents of `supabase/schema.sql`.
3. **Get your keys**: in Project Settings → API, copy the Project URL and the `service_role` secret key.
4. **Set env vars**: copy `.env.local.example` to `.env.local` and fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
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
3. Add the same two environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in the Vercel project settings.
4. Deploy.

## Architecture notes

- **Data model**: `recipes` (ingredients stored as a `jsonb` array on the row), `meal_plan` (one row per date+slot, upserted), `shopping_list_items` (fully replaced each time you rebuild the list from the meal plan).
- **No RLS policies**: all three tables have row-level security enabled with zero policies, which blocks the anon/public key entirely. Only the service role key (server-side only) can read or write.
- **Client/server split**: `app/page.tsx` is a Server Component that fetches everything up front; `components/LarderApp.tsx` is a Client Component holding UI state, calling the Server Actions in `app/actions.ts` for every mutation and updating local state from the result (optimistic where it's cheap to roll back, e.g. meal-plan assignment).
