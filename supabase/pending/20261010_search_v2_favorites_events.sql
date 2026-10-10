-- ════════════════════════════════════════════════════════════════════════════
-- Search v2 — favorites, search/click events, public read of area aliases
-- DRAFT FOR THE DB TEAM. Not applied from the website repo.
--
-- The website already ships the code for all three and degrades without them:
--   • favorites stay in the browser (localStorage) until customer_favorites
--     exists; the first sign-in after it does merges them into the account;
--   • /api/events drops events quietly until log_search_events exists;
--   • area aliases are read server-side with the service role until anon can
--     read them (C below) — after that the service-role read can be removed.
-- Nothing here touches existing tables' data or existing functions.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── A. customer_favorites ──────────────────────────────────────────────────
-- One row per (account, unit). Keyed on auth.users so it works for every
-- signed-in guest, whatever their profiles row looks like.
create table if not exists public.customer_favorites (
  profile_id uuid        not null references auth.users(id) on delete cascade,
  unit_id    uuid        not null references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, unit_id)
);
create index if not exists customer_favorites_unit_idx on public.customer_favorites (unit_id);

alter table public.customer_favorites enable row level security;

drop policy if exists "favorites: read own"   on public.customer_favorites;
drop policy if exists "favorites: add own"    on public.customer_favorites;
drop policy if exists "favorites: remove own" on public.customer_favorites;
create policy "favorites: read own"   on public.customer_favorites for select to authenticated using (profile_id = auth.uid());
create policy "favorites: add own"    on public.customer_favorites for insert to authenticated with check (profile_id = auth.uid());
create policy "favorites: remove own" on public.customer_favorites for delete to authenticated using (profile_id = auth.uid());

revoke all on public.customer_favorites from anon;
grant select, insert, delete on public.customer_favorites to authenticated;

-- ── B. search_events + log_search_events() ─────────────────────────────────
-- What guests search for and what they do with the results — the data any
-- future ranking work learns from. NO PII: no names, emails, phones, IPs or
-- free text a guest typed (the site sends the RESOLVED city/area names only).
-- customer_id is taken from auth.uid() inside the function, never from input.
--
-- Two columns beyond the brief: `source` (where a unit_click came from:
-- results / home / city / similar / map) and `unit_ids` (results_shown: the
-- first 24 ids in order).
create table if not exists public.search_events (
  id          bigint generated always as identity primary key,
  session_id  text        not null check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  customer_id uuid        null references auth.users(id) on delete set null,
  event       text        not null check (event in (
                'search', 'results_shown', 'unit_click', 'unit_view',
                'reserve_click', 'whatsapp_click', 'favorite')),
  source      text        null check (source is null or length(source) <= 32),
  city        text        null check (city is null or length(city) <= 80),
  area        text        null check (area is null or length(area) <= 80),
  check_in    date        null,
  check_out   date        null,
  guests      smallint    null check (guests is null or guests between 0 and 50),
  type        text        null check (type is null or length(type) <= 20),
  filters     jsonb       null,
  unit_id     uuid        null,
  unit_ids    uuid[]      null check (unit_ids is null or cardinality(unit_ids) <= 24),
  position    integer     null check (position is null or position between 0 and 10000),
  locale      text        null check (locale is null or length(locale) <= 5),
  device      text        null check (device is null or device in ('mobile', 'tablet', 'desktop')),
  utm         jsonb       null,
  created_at  timestamptz not null default now()
);
create index if not exists search_events_session_idx on public.search_events (session_id, created_at desc);
create index if not exists search_events_created_idx on public.search_events (created_at desc);
create index if not exists search_events_unit_idx    on public.search_events (unit_id) where unit_id is not null;

-- No policies: nobody reads or writes the table directly from a client.
alter table public.search_events enable row level security;
revoke all on public.search_events from anon, authenticated;

-- Insert-only entry point. A batch of up to 25 events from ONE session;
-- at most 600 events per session per hour (anything beyond is dropped, not
-- an error). Malformed fields are nulled rather than failing the batch.
create or replace function public.log_search_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session text;
  v_recent  integer;
  v_count   integer;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if jsonb_array_length(p_events) = 0 then return 0; end if;
  if jsonb_array_length(p_events) > 25 then
    raise exception 'too many events' using errcode = '22023';
  end if;

  v_session := p_events->0->>'session_id';
  if v_session is null or v_session !~ '^[A-Za-z0-9_-]{8,64}$' then return 0; end if;
  if exists (select 1 from jsonb_array_elements(p_events) e where e->>'session_id' is distinct from v_session) then
    raise exception 'mixed sessions' using errcode = '22023';
  end if;

  select count(*) into v_recent
    from public.search_events
   where session_id = v_session and created_at > now() - interval '1 hour';
  if v_recent + jsonb_array_length(p_events) > 600 then return 0; end if;

  insert into public.search_events (
    session_id, customer_id, event, source, city, area, check_in, check_out,
    guests, type, filters, unit_id, unit_ids, position, locale, device, utm
  )
  select
    v_session,
    auth.uid(),
    e->>'event',
    left(e->>'source', 32),
    left(e->>'city', 80),
    left(e->>'area', 80),
    case when e->>'check_in'  ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'check_in')::date  end,
    case when e->>'check_out' ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'check_out')::date end,
    case when e->>'guests' ~ '^\d{1,2}$' then least((e->>'guests')::int, 50)::smallint end,
    left(e->>'type', 20),
    case when jsonb_typeof(e->'filters') = 'object' and length((e->'filters')::text) <= 2000 then e->'filters' end,
    case when e->>'unit_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e->>'unit_id')::uuid end,
    case when jsonb_typeof(e->'unit_ids') = 'array' then (
      select array_agg(x::uuid order by i)
        from jsonb_array_elements_text(e->'unit_ids') with ordinality t(x, i)
       where i <= 24 and x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) end,
    case when e->>'position' ~ '^\d{1,4}$' then (e->>'position')::int end,
    case when e->>'locale' in ('en', 'ar', 'tr', 'ru') then e->>'locale' end,
    case when e->>'device' in ('mobile', 'tablet', 'desktop') then e->>'device' end,
    case when jsonb_typeof(e->'utm') = 'object' and length((e->'utm')::text) <= 1000 then e->'utm' end
  from jsonb_array_elements(p_events) e
  where e->>'event' in ('search', 'results_shown', 'unit_click', 'unit_view',
                        'reserve_click', 'whatsapp_click', 'favorite');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.log_search_events(jsonb) from public;
grant execute on function public.log_search_events(jsonb) to anon, authenticated;

-- Suggested retention (not scheduled here): delete rows older than 13 months.
--   select cron.schedule('search-events-retention', '17 4 * * *',
--     $$delete from public.search_events where created_at < now() - interval '13 months'$$);

-- ── C. geo_area_aliases: public read ───────────────────────────────────────
-- A public reference list (Taksim → Beyoğlu, تقسيم → Beyoğlu …). Anon reads
-- return 0 rows today, so the website reads it with the service role.
alter table public.geo_area_aliases enable row level security;
drop policy if exists "aliases: public read" on public.geo_area_aliases;
create policy "aliases: public read" on public.geo_area_aliases for select to anon, authenticated using (true);
grant select on public.geo_area_aliases to anon, authenticated;

commit;
