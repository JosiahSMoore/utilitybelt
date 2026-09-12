-- The Larder — schema for a single-user recipe/meal-planner app.
-- Run this once in the Supabase SQL editor for your project.
--
-- There is no auth and no per-row ownership: every table has RLS enabled
-- with zero policies, which blocks the public anon/authenticated keys
-- entirely. The app only ever talks to Supabase from server-side Next.js
-- code using the service role key, which bypasses RLS by design.

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Dinner',
  servings integer not null default 4,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists meal_plan (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (date, slot)
);

create table if not exists shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity numeric not null default 0,
  unit text not null default '',
  recipe_names text[] not null default '{}',
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;
alter table meal_plan enable row level security;
alter table shopping_list_items enable row level security;

-- RLS blocks row access without a matching policy, but table-level access is a
-- separate Postgres GRANT layer underneath it. New Supabase projects usually
-- set this up automatically for service_role, but it's not guaranteed —
-- without it, even the service role key gets "permission denied for table".
grant usage on schema public to service_role;
grant all on public.recipes, public.meal_plan, public.shopping_list_items to service_role;
