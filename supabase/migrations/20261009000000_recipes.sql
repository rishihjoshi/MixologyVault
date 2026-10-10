-- MixologyVault recipe schema: recipes, ingredients (inventory), and the
-- recipe_ingredients bridge that resolves the positionally-aligned
-- ingredients/measurements arrays from the JSON source.

create table if not exists ingredients (
  id       text primary key,
  name     text not null unique,              -- natural key; FK target
  category text,
  brand    text,
  status   text not null default 'can-get' check (status in ('have', 'can-get')),
  notes    text
);

create table if not exists recipes (
  id           text primary key,              -- existing slug, e.g. classic-margarita
  name         text not null,
  kind         text not null check (kind in ('cocktail', 'mocktail')),
  base         text,                           -- baseSpirit (cocktail) / baseIngredient (mocktail)
  tags         text[] not null default '{}',
  glasses      text[] not null default '{}',
  garnishes    text[] not null default '{}',
  history      text,
  description  text,
  instructions text,                           -- JSON `recipe` field
  mood         text,
  created_at   timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id              bigint generated always as identity primary key,
  recipe_id       text not null references recipes(id) on delete cascade,
  position        int  not null,               -- array index, preserves order
  ingredient_name text not null references ingredients(name) on update cascade,
  measurement_ml  text,
  measurement_oz  text,
  unique (recipe_id, position)
);

create index if not exists recipe_ingredients_recipe_id_idx on recipe_ingredients (recipe_id);
create index if not exists recipe_ingredients_ingredient_name_idx on recipe_ingredients (ingredient_name);
create index if not exists recipes_tags_idx on recipes using gin (tags);

-- Public read-only: reference data, no auth yet. Writes go through the
-- service role, which bypasses RLS.
alter table ingredients        enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;

drop policy if exists "public read ingredients"        on ingredients;
drop policy if exists "public read recipes"            on recipes;
drop policy if exists "public read recipe_ingredients" on recipe_ingredients;

create policy "public read ingredients"        on ingredients        for select using (true);
create policy "public read recipes"            on recipes            for select using (true);
create policy "public read recipe_ingredients" on recipe_ingredients for select using (true);
