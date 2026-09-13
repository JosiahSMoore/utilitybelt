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

-- "recipe" items are wiped and regenerated every time the list is rebuilt
-- from the meal plan; "manual" items (quick-added by hand) are left alone
-- by a rebuild so they don't get silently deleted.
alter table shopping_list_items add column if not exists source text not null default 'recipe';
alter table shopping_list_items drop constraint if exists shopping_list_items_source_check;
alter table shopping_list_items add constraint shopping_list_items_source_check check (source in ('recipe', 'manual'));

-- Shared ingredient library: a name, a default unit, and calories PER ONE
-- UNIT of that default unit (a rate, e.g. calories per gram) — not a total.
-- Each recipe's own ingredient line (still stored in recipes.ingredients
-- jsonb, unchanged) can optionally carry a "libraryId" pointing here, but
-- always keeps its own quantity/unit/calories so it can be overridden
-- per recipe without touching the shared rate.
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default 'g',
  calories_per_unit numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Added after the table's initial creation — "add column if not exists" so
-- this stays safe to run against a project that already has the table.
alter table ingredients add column if not exists protein_per_unit numeric not null default 0;
alter table ingredients add column if not exists fiber_per_unit numeric not null default 0;
-- Default for whether this ingredient is a pantry staple (salt, oil, etc.)
-- that shouldn't show up on the shopping list every time. Each recipe's own
-- ingredient line can still override this per use.
alter table ingredients add column if not exists pantry_staple boolean not null default false;

create unique index if not exists ingredients_name_lower_idx on ingredients (lower(name));

-- A slot's meal is either a real recipe (recipe_id) or a one-off custom
-- meal (custom_meal) typed in on the spot — never both. Custom meals are
-- intentionally NOT saved to the recipes table; they only ever live here.
alter table meal_plan add column if not exists custom_meal jsonb;

-- When recipe_id points to a recipe with flexible ingredients (swappable
-- options like "pick your vegetables" in a curry), this holds the ids of
-- the ingredient lines that are toggled ON for THIS specific occurrence —
-- independent of any other date/slot using the same recipe. Null means
-- "use the recipe's own defaults" (recipes without flex ingredients, or
-- rows saved before this feature existed).
alter table meal_plan add column if not exists flex_selection jsonb;

-- Extra items eaten on a given day outside any planned meal slot. Simpler
-- than a recipe ingredient on purpose — just a label and a calorie count,
-- no protein/fiber tracking, no link back to the ingredient library (the
-- library is only used client-side as a convenience to look up calories
-- when adding one of these).
create table if not exists daily_extras (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  calories numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table recipes enable row level security;
alter table meal_plan enable row level security;
alter table shopping_list_items enable row level security;
alter table ingredients enable row level security;
alter table daily_extras enable row level security;

-- RLS blocks row access without a matching policy, but table-level access is a
-- separate Postgres GRANT layer underneath it. New Supabase projects usually
-- set this up automatically for service_role, but it's not guaranteed —
-- without it, even the service role key gets "permission denied for table".
grant usage on schema public to service_role;
grant all on public.recipes, public.meal_plan, public.shopping_list_items, public.ingredients, public.daily_extras to service_role;

-- Migration: existing recipes predate the per-line "whole recipe" vs
-- "per serving" toggle, so their ingredient objects have no servingMode key.
-- Backfill it to "whole" (today's only behavior) so nothing changes for
-- recipes saved before this feature existed. Idempotent — only touches
-- ingredient objects that don't already have the key, so re-running this
-- whole file is still safe.
update recipes
set ingredients = (
  select jsonb_agg(
    case
      when elem ? 'servingMode' then elem
      else elem || jsonb_build_object('servingMode', 'whole')
    end
  )
  from jsonb_array_elements(ingredients) as elem
)
where jsonb_array_length(ingredients) > 0
  and exists (
    select 1 from jsonb_array_elements(ingredients) as elem
    where not (elem ? 'servingMode')
  );
