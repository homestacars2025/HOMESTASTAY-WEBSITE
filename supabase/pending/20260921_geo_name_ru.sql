-- ─────────────────────────────────────────────────────────────────────────────
-- Russian place names for geo_cities and geo_districts.
--
-- ⚠️ NOT APPLIED. Written for review on 2026-09-21; run it only once full
-- Russian support for place names is decided. Until then the site falls back
-- to name_en for Russian visitors (see src/lib/geo/localize.ts).
--
-- WHY IT LIVES IN supabase/pending/, NOT supabase/migrations/
--   A Supabase GitHub integration, if one is ever enabled for this repo,
--   applies whatever sits in supabase/migrations/ when it lands on main. This
--   file must not run by accident, so it is parked outside that folder. To
--   apply it: move it into supabase/migrations/ in the same change that is
--   meant to run it (or run it by hand in the SQL editor), never before.
--
-- Additive and nullable: no existing reader breaks, and a NULL name_ru keeps
-- the English fallback working for any row not yet translated. The shared
-- STAY database is also read by the mobile app — neither table is changed in
-- any way it could notice beyond one extra column.
--
-- After applying:
--   1. Fill name_ru (e.g. 'Стамбул', 'Шишли'). Leave NULL where unsure.
--   2. Site: add `ru: 'name_ru'` to COLUMN in src/lib/geo/localize.ts and
--      `name_ru` to the geo selects in src/lib/queries/stays.ts and
--      src/lib/data/cities.ts. That is the whole code change.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

alter table public.geo_cities    add column if not exists name_ru text;
alter table public.geo_districts add column if not exists name_ru text;

comment on column public.geo_cities.name_ru    is 'Russian display name. NULL = fall back to name_en.';
comment on column public.geo_districts.name_ru is 'Russian display name. NULL = fall back to name_en.';

-- The anon role reads these tables for the public site; a column added after
-- a column-level grant is not covered by it. Harmless if grants are
-- table-level already.
grant select (name_ru) on public.geo_cities    to anon, authenticated;
grant select (name_ru) on public.geo_districts to anon, authenticated;

commit;
