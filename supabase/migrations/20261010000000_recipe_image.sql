-- Store the recipe's image path (e.g. assets/img/classic-margarita.jpg).
-- null means no photo -> the app falls back to a glass-shaped placeholder.
alter table recipes add column if not exists image_filename text;
