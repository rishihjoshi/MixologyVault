-- Per-user state (bar + favourites + shopping-list ticks) and a view that
-- reassembles recipes into the JSON-shaped arrays the client already expects.

-- One row per user, mirroring the three localStorage keys.
create table if not exists user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  overrides  jsonb not null default '{}',   -- {ingId: 'have'|'need'}  (bar + shopping list)
  favourites jsonb not null default '[]',    -- [recipeId]
  checked    jsonb not null default '[]',    -- [ingId] ticked off on the shopping list
  updated_at timestamptz not null default now()
);
alter table user_state enable row level security;
drop policy if exists "own state" on user_state;
create policy "own state" on user_state for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tell the 37 real pantry ingredients apart from the 26 FK-placeholder rows,
-- so the bar screen only offers bottles the user actually tracks.
alter table ingredients add column if not exists is_pantry boolean not null default true;
update ingredients set is_pantry = false where notes = 'auto-added for recipe FK';

-- Reassemble recipe_ingredients back into positionally-aligned arrays.
-- Filtering on ri.position (not the value) keeps all three arrays the same
-- length even when a measurement is null.
create or replace view recipes_full with (security_invoker = on) as
select r.*,
  coalesce(array_agg(ri.ingredient_name order by ri.position)
           filter (where ri.position is not null), '{}') as ingredients,
  coalesce(array_agg(ri.measurement_ml  order by ri.position)
           filter (where ri.position is not null), '{}') as measurements_ml,
  coalesce(array_agg(ri.measurement_oz  order by ri.position)
           filter (where ri.position is not null), '{}') as measurements_oz
from recipes r
left join recipe_ingredients ri on ri.recipe_id = r.id
group by r.id;

grant select on recipes_full to anon, authenticated;
