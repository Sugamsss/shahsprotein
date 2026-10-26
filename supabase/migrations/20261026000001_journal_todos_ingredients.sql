-- Migration: 20261026000001_journal_todos_ingredients.sql
-- The journal, to-dos and ingredients (admin only).
--
-- Stored once:
--   journal_entries      one per person per day: mood, words, hours, tags, only-me
--   journal_purchases    "What you bought" lines on an entry, optionally an ingredient and how much
--   journal_photos       pictures on an entry (files in the private Storage bucket 'journal')
--   journal_replies      a short reply under an entry
--   journal_keeps        "Keep this one", per person
--   journal_milestones   days marked by hand
--   todos                something that isn't an order: for one admin or either, an optional day
--   ingredients          what the kitchen keeps: food (grams) or packaging (pieces)
--   ingredient_uses      grams of an ingredient in 1 kg of a product (Pranjali sets these)
--   ingredient_counts    a count by hand; the newest one is where stock starts again
--
-- Worked out, never stored: a day's figures (cooked, packed, delivered, came in,
-- spent, hours), what's left of each ingredient (the last count, plus bought since,
-- less what batches logged since used), milestones from the orders, and each
-- month's summary.
--
-- Privacy: an only-me entry is returned to its author alone (feed, search, look
-- back, its photos, its replies). Its hours and spend still count in totals.
-- Everything goes through security definer RPCs that check is_admin(); the tables
-- have RLS on, no policies and nothing granted. Validation errors use errcode
-- 22023 with a plain message.

-- ═══════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users(id),
  -- The India date the entry is about.
  day date not null,
  mood smallint check (mood between 1 and 5),
  body text not null default '' check (char_length(body) <= 5000),
  hours numeric(3,1) check (hours between 0 and 24 and hours * 2 = round(hours * 2)),
  private boolean not null default false,
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint journal_entries_one_a_day unique (author, day)
);
create index if not exists journal_entries_day_idx on public.journal_entries (day desc);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'food' check (kind in ('food', 'packaging')),
  -- food is counted in grams, packaging in pieces.
  unit text not null default 'g' check (unit in ('g', 'pieces')),
  -- "Low" at or under this much; null: never flagged.
  low_at numeric(12,2) check (low_at >= 0 and low_at <= 10000000),
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create unique index if not exists ingredients_name_key on public.ingredients (lower(name));

create table if not exists public.ingredient_uses (
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  product_id text not null references public.kitchen_products(product_id) on delete cascade,
  -- In the ingredient's unit, per 1 kg of the product cooked.
  per_kg numeric(12,2) not null check (per_kg > 0 and per_kg <= 1000000),
  primary key (ingredient_id, product_id)
);

create table if not exists public.ingredient_counts (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0 and amount <= 10000000),
  counted_at timestamptz not null default clock_timestamp(),
  counted_by uuid references auth.users(id) on delete set null
);
create index if not exists ingredient_counts_newest_idx on public.ingredient_counts (ingredient_id, counted_at desc);

create table if not exists public.journal_purchases (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  position smallint not null default 0,
  item text not null check (char_length(item) between 1 and 80),
  amount integer not null check (amount between 0 and 1000000),
  ingredient_id uuid references public.ingredients(id) on delete set null,
  -- In the ingredient's unit; only with an ingredient.
  quantity numeric(12,2) check (quantity > 0 and quantity <= 10000000),
  -- When the line was first written: a count after it means it's already in the count.
  created_at timestamptz not null default clock_timestamp(),
  constraint journal_purchases_quantity_needs_ingredient check (quantity is null or ingredient_id is not null)
);
create index if not exists journal_purchases_entry_idx on public.journal_purchases (entry_id, position);
create index if not exists journal_purchases_ingredient_idx on public.journal_purchases (ingredient_id) where ingredient_id is not null;

create table if not exists public.journal_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  -- <entry id>/<photo id>.<ext> in the 'journal' bucket.
  path text not null unique,
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists journal_photos_entry_idx on public.journal_photos (entry_id, created_at);

create table if not exists public.journal_replies (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  author uuid not null references auth.users(id),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists journal_replies_entry_idx on public.journal_replies (entry_id, created_at);

create table if not exists public.journal_keeps (
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (entry_id, admin_id)
);

create table if not exists public.journal_milestones (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  title text not null check (char_length(title) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists journal_milestones_day_idx on public.journal_milestones (day desc);

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 200),
  -- One admin, or null: either of them.
  assignee uuid references auth.users(id) on delete set null,
  due_on date,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  entry_id uuid references public.journal_entries(id) on delete set null,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- Deleting only hides it, so Undo can bring it back.
  deleted_at timestamptz,
  constraint todos_done_by_needs_done check (done_by is null or done_at is not null)
);
create index if not exists todos_open_idx on public.todos (due_on) where done_at is null and deleted_at is null;
create index if not exists todos_done_idx on public.todos (done_at desc) where done_at is not null and deleted_at is null;

alter table public.journal_entries enable row level security;
alter table public.journal_purchases enable row level security;
alter table public.journal_photos enable row level security;
alter table public.journal_replies enable row level security;
alter table public.journal_keeps enable row level security;
alter table public.journal_milestones enable row level security;
alter table public.todos enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_uses enable row level security;
alter table public.ingredient_counts enable row level security;

revoke all on public.journal_entries, public.journal_purchases, public.journal_photos, public.journal_replies,
  public.journal_keeps, public.journal_milestones, public.todos, public.ingredients, public.ingredient_uses,
  public.ingredient_counts from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Small helpers (not callable from outside)
-- ═══════════════════════════════════════════════════════

create or replace function public.journal_today()
returns date language sql stable set search_path = public as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

-- One line: control characters become spaces, runs of space become one, trimmed. Null when empty.
create or replace function public.journal_clean_line(p_text text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[\x01-\x1F\x7F-\x9F  ]', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

-- Several lines: \r\n becomes \n, other control characters go, at most two empty lines in a row, trimmed.
create or replace function public.journal_clean_text(p_text text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    regexp_replace(replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'), '[\x01-\x08\x0B-\x1F\x7F-\x9F  ]', '', 'g'),
    E'\n{3,}', E'\n\n', 'g'), E' \t\n');
$$;

-- { id, name }: the admin's display name, else the start of their email; null for nobody.
create or replace function public.journal_person(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_id is null then null else jsonb_build_object(
    'id', p_id,
    'name', coalesce(
      (select coalesce(nullif(btrim(a.display_name), ''), split_part(a.email, '@', 1)) from public.admin_users a where a.id = p_id),
      (select split_part(u.email, '@', 1) from auth.users u where u.id = p_id)
    )
  ) end;
$$;

create or replace function public.journal_people()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', coalesce(nullif(btrim(a.display_name), ''), split_part(a.email, '@', 1)),
    'home_view', a.home_view
  ) order by (a.id = auth.uid()) desc, a.created_at, a.id), '[]'::jsonb)
  from public.admin_users a;
$$;

-- Can the caller see this entry? Its author always; anyone else unless it's only-me.
create or replace function public.journal_can_see(p_entry uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = p_entry and (not e.private or e.author = auth.uid())
  );
$$;

-- One entry as the admin reads it. The caller has already checked it can be seen.
create or replace function public.journal_entry_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'author', public.journal_person(e.author),
    'mine', e.author = auth.uid(),
    'day', e.day,
    'mood', e.mood,
    'body', e.body,
    'hours', e.hours,
    'private', e.private,
    'tags', to_jsonb(e.tags),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'item', p.item, 'amount', p.amount, 'ingredient_id', p.ingredient_id, 'quantity', p.quantity
      ) order by p.position, p.created_at, p.id)
      from public.journal_purchases p where p.entry_id = e.id
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.path, 'width', ph.width, 'height', ph.height)
        order by ph.created_at, ph.id)
      from public.journal_photos ph where ph.entry_id = e.id
    ), '[]'::jsonb),
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'author', public.journal_person(r.author), 'mine', r.author = auth.uid(), 'body', r.body, 'created_at', r.created_at
      ) order by r.created_at, r.id)
      from public.journal_replies r where r.entry_id = e.id
    ), '[]'::jsonb),
    'kept', exists (select 1 from public.journal_keeps k where k.entry_id = e.id and k.admin_id = auth.uid()),
    'todos', (select count(*) from public.todos t where t.entry_id = e.id and t.deleted_at is null),
    'created_at', e.created_at,
    'updated_at', e.updated_at
  )
  from public.journal_entries e where e.id = p_id;
$$;

-- A day's figures from the rest of the admin: cooked (grams logged with that made-on day),
-- packed (orders moved to Ready that day), delivered, came in (payments, never Gift), and
-- the journal's own spent and hours (every entry, only-me ones too).
create or replace function public.journal_day_facts(p_from date, p_to date)
returns table (day date, cooked_grams bigint, packed bigint, delivered bigint, came_in bigint, spent bigint, hours numeric)
language sql stable security definer set search_path = public as $$
  with days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d)
  select
    days.day,
    coalesce((select sum(b.grams) from public.kitchen_batches b where b.made_on = days.day), 0)::bigint,
    (select count(distinct ev.order_id) from public.order_events ev
      where ev.event = 'ready' and (timezone('Asia/Kolkata', ev.at))::date = days.day)::bigint,
    (select count(distinct ev.order_id) from public.order_events ev
      where ev.event = 'delivered' and (timezone('Asia/Kolkata', ev.at))::date = days.day)::bigint,
    coalesce((select sum(pay.amount) from public.order_payments pay
      where pay.method is distinct from 'gift' and (timezone('Asia/Kolkata', pay.paid_at))::date = days.day), 0)::bigint,
    coalesce((select sum(p.amount) from public.journal_purchases p join public.journal_entries e on e.id = p.entry_id
      where e.day = days.day), 0)::bigint,
    coalesce((select sum(e.hours) from public.journal_entries e where e.day = days.day), 0)::numeric
  from days;
$$;

-- Milestones worked out from the orders: launch day (the first order that wasn't cancelled),
-- 1, 2, 3, 6 and 9 months on and then each year, the day the packs passed 100, 250, 500, 1000, 2500, 5000 and 10000,
-- and the first time someone ordered again.
create or replace function public.journal_auto_milestones()
returns table (day date, kind text, value integer)
language sql stable security definer set search_path = public as $$
  with real_orders as (
    select o.id, o.phone, (timezone('Asia/Kolkata', o.created_at))::date as day, o.created_at
    from public.orders o where o.status <> 'cancelled'
  ),
  launch as (select min(day) as day from real_orders),
  months as (
    select (l.day + make_interval(months => n))::date as day, n
    from launch l, generate_series(1, 240) n
    where l.day is not null and (l.day + make_interval(months => n))::date <= public.journal_today()
      -- The first quarter, half a year, nine months, then each year: not every month.
      and (n in (1, 2, 3, 6, 9) or n % 12 = 0)
  ),
  packs as (
    select r.day, sum(sum(ol.quantity)) over (order by r.day) as running
    from real_orders r join public.order_lines ol on ol.order_id = r.id
    where ol.size <> 'sample'
    group by r.day
  ),
  thresholds as (select unnest(array[100, 250, 500, 1000, 2500, 5000, 10000]) as n),
  pack_days as (
    select t.n, min(p.day) as day from thresholds t join packs p on p.running >= t.n group by t.n
  ),
  returning_first as (
    select min(r2.day) as day
    from real_orders r2
    where r2.phone is not null and exists (
      select 1 from real_orders r1 where r1.phone = r2.phone and r1.created_at < r2.created_at
    )
  )
  select l.day, 'launch', 0 from launch l where l.day is not null
  union all select m.day, 'months', m.n from months m
  union all select pd.day, 'packs', pd.n from pack_days pd where pd.day is not null
  union all select rf.day, 'returning', 0 from returning_first rf where rf.day is not null;
$$;

-- What's left of each ingredient: the newest count, plus quantities bought since,
-- less what batches logged since used (grams ÷ 1000 × the amount per kg). stock is null
-- when there's nothing to go on yet (never counted, never bought).
create or replace function public.ingredient_stock()
returns table (ingredient_id uuid, stock numeric, counted_at timestamptz, last_bought_on date)
language sql stable security definer set search_path = public as $$
  select
    i.id,
    case when c.id is null and not exists (
      select 1 from public.journal_purchases p where p.ingredient_id = i.id and p.quantity is not null
    ) then null else round(
      coalesce(c.amount, 0)
      + coalesce((select sum(p.quantity) from public.journal_purchases p
          where p.ingredient_id = i.id and p.quantity is not null and (c.id is null or p.created_at > c.counted_at)), 0)
      - coalesce((select sum(b.grams / 1000.0 * u.per_kg) from public.kitchen_batches b
          join public.ingredient_uses u on u.product_id = b.product_id and u.ingredient_id = i.id
          where c.id is null or b.created_at > c.counted_at), 0)
    , 2) end,
    c.counted_at,
    (select max(e.day) from public.journal_purchases p join public.journal_entries e on e.id = p.entry_id
      where p.ingredient_id = i.id)
  from public.ingredients i
  left join lateral (
    select ic.id, ic.amount, ic.counted_at from public.ingredient_counts ic
    where ic.ingredient_id = i.id order by ic.counted_at desc, ic.id desc limit 1
  ) c on true;
$$;

create or replace function public.todo_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id,
    'text', t.body,
    'assignee', public.journal_person(t.assignee),
    'due_on', t.due_on,
    'done_at', t.done_at,
    'done_by', public.journal_person(t.done_by),
    'created_by', public.journal_person(t.created_by),
    'created_at', t.created_at,
    -- The entry it came from, unless that's someone else's only-me entry.
    'entry', (select jsonb_build_object('id', e.id, 'day', e.day, 'author', public.journal_person(e.author))
      from public.journal_entries e where e.id = t.entry_id and (not e.private or e.author = auth.uid())),
    'ingredient', (select jsonb_build_object('id', i.id, 'name', i.name) from public.ingredients i where i.id = t.ingredient_id),
    'deleted', t.deleted_at is not null
  )
  from public.todos t where t.id = p_id;
$$;

revoke all on function public.journal_today() from public, anon, authenticated;
revoke all on function public.journal_clean_line(text) from public, anon, authenticated;
revoke all on function public.journal_clean_text(text) from public, anon, authenticated;
revoke all on function public.journal_person(uuid) from public, anon, authenticated;
revoke all on function public.journal_people() from public, anon, authenticated;
revoke all on function public.journal_can_see(uuid) from public, anon, authenticated;
revoke all on function public.journal_entry_json(uuid) from public, anon, authenticated;
revoke all on function public.journal_day_facts(date, date) from public, anon, authenticated;
revoke all on function public.journal_auto_milestones() from public, anon, authenticated;
revoke all on function public.ingredient_stock() from public, anon, authenticated;
revoke all on function public.todo_json(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. Journal: reading
-- ═══════════════════════════════════════════════════════

-- The feed: newest day first, p_limit days at a time, before p_before (default: up to today).
-- A day shows when it has an entry the caller can see, a to-do done, or a milestone; today always.
-- { days: [{ day, facts, entries, done, milestones }], has_more, me, people, launch_on }
create or replace function public.get_admin_journal(p_before date default null, p_limit integer default 10)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.journal_today();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 60);
  v_days date[];
  v_more boolean;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  with candidates as (
    select e.day from public.journal_entries e where not e.private or e.author = auth.uid()
    union select (timezone('Asia/Kolkata', t.done_at))::date from public.todos t where t.done_at is not null and t.deleted_at is null
    union select m.day from public.journal_milestones m
    union select a.day from public.journal_auto_milestones() a
    union select v_today
  )
  select array_agg(c.day order by c.day desc) into v_days
  from (
    select day from candidates
    where day <= v_today and (p_before is null or day < p_before)
    order by day desc limit v_limit + 1
  ) c;

  v_days := coalesce(v_days, '{}');
  v_more := cardinality(v_days) > v_limit;
  if v_more then v_days := v_days[1:v_limit]; end if;

  return jsonb_build_object(
    'me', auth.uid(),
    'people', public.journal_people(),
    'launch_on', (select min(a.day) from public.journal_auto_milestones() a where a.kind = 'launch'),
    'has_more', v_more,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'facts', (select jsonb_build_object(
            'cooked_grams', f.cooked_grams, 'packed', f.packed, 'delivered', f.delivered,
            'came_in', f.came_in, 'spent', f.spent, 'hours', f.hours)
          from public.journal_day_facts(d.day, d.day) f),
        'entries', coalesce((
          select jsonb_agg(public.journal_entry_json(e.id) order by (e.author = auth.uid()) desc, e.created_at, e.id)
          from public.journal_entries e
          where e.day = d.day and (not e.private or e.author = auth.uid())
        ), '[]'::jsonb),
        'done', coalesce((
          select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.body, 'done_by', public.journal_person(t.done_by))
            order by t.done_at, t.id)
          from public.todos t
          where t.deleted_at is null and t.done_at is not null and (timezone('Asia/Kolkata', t.done_at))::date = d.day
        ), '[]'::jsonb),
        'milestones', coalesce((
          select jsonb_agg(x.m order by x.ord, x.k)
          from (
            select jsonb_build_object('id', m.id, 'kind', 'hand', 'value', 0, 'title', m.title) as m, 1 as ord, m.created_at::text as k
            from public.journal_milestones m where m.day = d.day
            union all
            select jsonb_build_object('id', null, 'kind', a.kind, 'value', a.value, 'title', null), 0, a.kind || a.value
            from public.journal_auto_milestones() a where a.day = d.day
          ) x
        ), '[]'::jsonb)
      ) order by d.day desc)
      from unnest(v_days) as d(day)
    ), '[]'::jsonb)
  );
end;
$$;

-- Look back: entries from this day of month in earlier months, every milestone,
-- and a summary of each month (entries, photos, Great days, hours, spent, and each
-- person's most loved entry that month for "a line from each of you").
create or replace function public.get_admin_journal_lookback()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.journal_today();
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'on_this_day', coalesce((
      select jsonb_agg(public.journal_entry_json(e.id) order by e.day desc, e.created_at)
      from public.journal_entries e
      where (not e.private or e.author = auth.uid())
        and e.day < v_today
        and extract(day from e.day) = extract(day from v_today)
    ), '[]'::jsonb),
    'kept', coalesce((
      select jsonb_agg(public.journal_entry_json(e.id) order by k.created_at desc)
      from public.journal_keeps k join public.journal_entries e on e.id = k.entry_id
      where k.admin_id = auth.uid() and (not e.private or e.author = auth.uid())
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(x.m order by x.day desc, x.ord)
      from (
        select m.day, 1 as ord, jsonb_build_object('id', m.id, 'day', m.day, 'kind', 'hand', 'value', 0, 'title', m.title) as m
        from public.journal_milestones m
        union all
        select a.day, 0, jsonb_build_object('id', null, 'day', a.day, 'kind', a.kind, 'value', a.value, 'title', null)
        from public.journal_auto_milestones() a
      ) x
    ), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
          'month', g.month,
          'entries', g.entries,
          'photos', (select count(*) from public.journal_photos ph join public.journal_entries e2 on e2.id = ph.entry_id
            where date_trunc('month', e2.day) = g.month and (not e2.private or e2.author = auth.uid())),
          'great_days', g.great_days,
          'hours', g.hours,
          'spent', coalesce((select sum(p.amount) from public.journal_purchases p join public.journal_entries e3 on e3.id = p.entry_id
            where date_trunc('month', e3.day) = g.month), 0),
          'lines', coalesce((
            select jsonb_agg(public.journal_entry_json(best.id) order by (best.author = auth.uid()) desc)
            from (
              select distinct on (e4.author) e4.id, e4.author
              from public.journal_entries e4
              where date_trunc('month', e4.day) = g.month
                and (not e4.private or e4.author = auth.uid())
                and char_length(e4.body) > 0
              order by e4.author,
                (select count(*) from public.journal_keeps k where k.entry_id = e4.id) desc,
                e4.mood desc nulls last, char_length(e4.body) desc, e4.day desc
            ) best
          ), '[]'::jsonb)
        ) order by g.month desc)
      from (
        select date_trunc('month', e.day)::date as month,
          count(*) filter (where not e.private or e.author = auth.uid()) as entries,
          count(distinct e.day) filter (where e.mood = 5 and (not e.private or e.author = auth.uid())) as great_days,
          coalesce(sum(e.hours), 0) as hours
        from public.journal_entries e
        group by 1
      ) g
      where g.entries > 0
    ), '[]'::jsonb)
  );
end;
$$;

-- One month, every entry the caller can see, oldest first: the keepsake page.
create or replace function public.get_admin_journal_month(p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_start date := date_trunc('month', coalesce(p_month, public.journal_today()))::date;
  v_end date := (date_trunc('month', coalesce(p_month, public.journal_today())) + interval '1 month - 1 day')::date;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return jsonb_build_object(
    'month', v_start,
    'entries', coalesce((
      select jsonb_agg(public.journal_entry_json(e.id) order by e.day, (e.author = auth.uid()) desc, e.created_at)
      from public.journal_entries e
      where e.day between v_start and v_end and (not e.private or e.author = auth.uid())
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(x.m order by x.day, x.ord)
      from (
        select m.day, 1 as ord, jsonb_build_object('id', m.id, 'day', m.day, 'kind', 'hand', 'value', 0, 'title', m.title) as m
        from public.journal_milestones m where m.day between v_start and v_end
        union all
        select a.day, 0, jsonb_build_object('id', null, 'day', a.day, 'kind', a.kind, 'value', a.value, 'title', null)
        from public.journal_auto_milestones() a where a.day between v_start and v_end
      ) x
    ), '[]'::jsonb),
    'facts', (select jsonb_build_object(
        'cooked_grams', coalesce(sum(f.cooked_grams), 0), 'packed', coalesce(sum(f.packed), 0),
        'delivered', coalesce(sum(f.delivered), 0), 'came_in', coalesce(sum(f.came_in), 0),
        'spent', coalesce(sum(f.spent), 0), 'hours', coalesce(sum(f.hours), 0))
      from public.journal_day_facts(v_start, least(v_end, public.journal_today())) f)
  );
end;
$$;

-- Search: words in the entry, its tags or its bought lines (any case), with filters.
-- Adds up what matched: entries, people, ₹ spent on lines that match the words (or on
-- every matched entry when there are no words), and how many are tagged Problem.
create or replace function public.search_admin_journal(
  p_query text default null,
  p_author uuid default null,
  p_tag text default null,
  p_kept boolean default null,
  p_photos boolean default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q text := public.journal_clean_line(p_query);
  v_like text;
  v_tag text := lower(public.journal_clean_line(p_tag));
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if v_q is not null and char_length(v_q) > 80 then
    raise exception using message = 'That search is too long.', errcode = '22023';
  end if;
  v_like := case when v_q is null then null
    else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  select array_agg(e.id order by e.day desc, e.created_at desc) into v_ids
  from public.journal_entries e
  where (not e.private or e.author = auth.uid())
    and (p_author is null or e.author = p_author)
    and (v_tag is null or exists (select 1 from unnest(e.tags) t where lower(t) = v_tag))
    and (p_kept is not true or exists (select 1 from public.journal_keeps k where k.entry_id = e.id and k.admin_id = auth.uid()))
    and (p_photos is not true or exists (select 1 from public.journal_photos ph where ph.entry_id = e.id))
    and (v_like is null
      or e.body ilike v_like
      or exists (select 1 from unnest(e.tags) t where t ilike v_like)
      or exists (select 1 from public.journal_purchases p where p.entry_id = e.id and p.item ilike v_like));

  v_ids := coalesce(v_ids, '{}');

  return jsonb_build_object(
    'query', v_q,
    'count', cardinality(v_ids),
    'people', (select count(distinct e.author) from public.journal_entries e where e.id = any(v_ids)),
    'spent', coalesce((
      select sum(p.amount) from public.journal_purchases p
      where p.entry_id = any(v_ids) and (v_like is null or p.item ilike v_like)
    ), 0),
    'problems', (select count(*) from public.journal_entries e
      where e.id = any(v_ids) and exists (select 1 from unnest(e.tags) t where lower(t) = 'problem')),
    'entries', coalesce((
      select jsonb_agg(public.journal_entry_json(x.id) order by x.ord)
      from unnest(v_ids[1:least(greatest(coalesce(p_limit, 50), 1), 200)]) with ordinality as x(id, ord)
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(t.tag order by t.n desc, t.tag)
      from (
        select min(tag) as tag, count(*) as n
        from public.journal_entries e, unnest(e.tags) tag
        where not e.private or e.author = auth.uid()
        group by lower(tag)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- Hours and ₹ spent per day, from every entry, for Home's "How it's going".
create or replace function public.get_admin_work_days(p_from date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('day', d.day, 'hours', d.hours, 'spent', d.spent) order by d.day)
    from (
      select e.day,
        coalesce(sum(e.hours), 0) as hours,
        coalesce(sum((select sum(p.amount) from public.journal_purchases p where p.entry_id = e.id)), 0) as spent
      from public.journal_entries e
      where p_from is null or e.day >= p_from
      group by e.day
    ) d
  ), '[]'::jsonb);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Journal: writing
-- ═══════════════════════════════════════════════════════

-- Writes the caller's entry for a day (default today), making it if it isn't there.
-- p_entry: { mood, body, hours, private, tags, purchases: [{ id?, item, amount, ingredient_id?, quantity? }] }.
-- Every key is the whole new value. Bought lines keep their id (and so their place against
-- an ingredient count) when sent back with it; lines left out go.
create or replace function public.save_admin_journal_entry(p_day date, p_entry jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := public.journal_today();
  v_day date := coalesce(p_day, v_today);
  v_mood smallint;
  v_body text;
  v_hours numeric;
  v_private boolean;
  v_tags text[];
  v_tag text;
  v_lines jsonb;
  v_line jsonb;
  v_pos integer := 0;
  v_item text;
  v_amount numeric;
  v_ingredient uuid;
  v_quantity numeric;
  v_line_id uuid;
  v_keep uuid[] := '{}';
  v_entry public.journal_entries;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception using message = 'That entry doesn''t look right.', errcode = '22023';
  end if;
  if v_day > v_today then
    raise exception using message = 'That day hasn''t come yet.', errcode = '22023';
  end if;
  if v_day < date '2026-01-01' then
    raise exception using message = 'That day is too far back.', errcode = '22023';
  end if;

  -- Mood: 1 (Rough) to 5 (Great), or none.
  if jsonb_typeof(p_entry -> 'mood') = 'number' then
    if (p_entry ->> 'mood')::numeric not in (1, 2, 3, 4, 5) then
      raise exception using message = 'Pick how the day went.', errcode = '22023';
    end if;
    v_mood := (p_entry ->> 'mood')::smallint;
  elsif coalesce(jsonb_typeof(p_entry -> 'mood'), 'null') <> 'null' then
    raise exception using message = 'Pick how the day went.', errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_entry -> 'body'), 'null') not in ('string', 'null') then
    raise exception using message = 'That entry doesn''t look right.', errcode = '22023';
  end if;
  v_body := public.journal_clean_text(p_entry ->> 'body');
  if char_length(v_body) > 5000 then
    raise exception using message = 'An entry can be up to 5000 characters.', errcode = '22023';
  end if;

  if jsonb_typeof(p_entry -> 'hours') = 'number' then
    v_hours := (p_entry ->> 'hours')::numeric;
    if v_hours < 0 or v_hours > 24 or v_hours * 2 <> round(v_hours * 2) then
      raise exception using message = 'Hours go from 0 to 24, in half hours.', errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(p_entry -> 'hours'), 'null') <> 'null' then
    raise exception using message = 'Hours go from 0 to 24, in half hours.', errcode = '22023';
  end if;

  v_private := coalesce((p_entry ->> 'private')::boolean, false);

  v_tags := '{}';
  if coalesce(jsonb_typeof(p_entry -> 'tags'), 'null') not in ('array', 'null') then
    raise exception using message = 'Those tags don''t look right.', errcode = '22023';
  end if;
  for v_tag in select jsonb_array_elements_text(coalesce(p_entry -> 'tags', '[]'::jsonb)) loop
    v_tag := public.journal_clean_line(v_tag);
    if v_tag is null then continue; end if;
    if char_length(v_tag) > 24 then
      raise exception using message = 'A tag can be up to 24 characters.', errcode = '22023';
    end if;
    if not exists (select 1 from unnest(v_tags) t where lower(t) = lower(v_tag)) then
      v_tags := v_tags || v_tag;
    end if;
  end loop;
  if cardinality(v_tags) > 8 then
    raise exception using message = 'An entry can have up to 8 tags.', errcode = '22023';
  end if;

  v_lines := coalesce(p_entry -> 'purchases', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception using message = 'Something you bought doesn''t look right.', errcode = '22023';
  end if;
  if jsonb_array_length(v_lines) > 20 then
    raise exception using message = 'An entry can have up to 20 things bought.', errcode = '22023';
  end if;

  insert into public.journal_entries as je (author, day, mood, body, hours, private, tags)
  values (auth.uid(), v_day, v_mood, v_body, v_hours, v_private, v_tags)
  on conflict (author, day) do update set
    mood = excluded.mood, body = excluded.body, hours = excluded.hours,
    private = excluded.private, tags = excluded.tags, updated_at = timezone('utc', now())
  returning * into v_entry;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception using message = 'Something you bought doesn''t look right.', errcode = '22023';
    end if;
    v_item := public.journal_clean_line(v_line ->> 'item');
    if v_item is null or char_length(v_item) > 80 then
      raise exception using message = 'Say what you bought, in up to 80 characters.', errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'amount') <> 'number' then
      raise exception using message = 'Put what it cost in rupees.', errcode = '22023';
    end if;
    v_amount := (v_line ->> 'amount')::numeric;
    if v_amount < 0 or v_amount > 1000000 or v_amount <> round(v_amount) then
      raise exception using message = 'Put what it cost in whole rupees.', errcode = '22023';
    end if;
    v_ingredient := null;
    v_quantity := null;
    if coalesce(jsonb_typeof(v_line -> 'ingredient_id'), 'null') <> 'null' then
      if (v_line ->> 'ingredient_id') !~ '^[0-9a-fA-F-]{36}$'
        or not exists (select 1 from public.ingredients i where i.id = (v_line ->> 'ingredient_id')::uuid) then
        raise exception using message = 'That ingredient isn''t on the list any more.', errcode = '22023';
      end if;
      v_ingredient := (v_line ->> 'ingredient_id')::uuid;
      if jsonb_typeof(v_line -> 'quantity') = 'number' then
        v_quantity := (v_line ->> 'quantity')::numeric;
        if v_quantity <= 0 or v_quantity > 10000000 then
          raise exception using message = 'How much you bought doesn''t look right.', errcode = '22023';
        end if;
      elsif coalesce(jsonb_typeof(v_line -> 'quantity'), 'null') <> 'null' then
        raise exception using message = 'How much you bought doesn''t look right.', errcode = '22023';
      end if;
    end if;

    v_line_id := null;
    if (v_line ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then
      update public.journal_purchases
      set position = v_pos, item = v_item, amount = v_amount::integer, ingredient_id = v_ingredient, quantity = v_quantity
      where id = (v_line ->> 'id')::uuid and entry_id = v_entry.id
      returning id into v_line_id;
    end if;
    if v_line_id is null then
      insert into public.journal_purchases (entry_id, position, item, amount, ingredient_id, quantity)
      values (v_entry.id, v_pos, v_item, v_amount::integer, v_ingredient, v_quantity)
      returning id into v_line_id;
    end if;
    v_keep := v_keep || v_line_id;
    v_pos := v_pos + 1;
  end loop;

  delete from public.journal_purchases where entry_id = v_entry.id and not (id = any(v_keep));

  return public.journal_entry_json(v_entry.id);
end;
$$;

-- Deletes the caller's own entry (its lines, photos, replies and keeps go with it; to-dos
-- made from it stay). Returns the photo paths, so the admin can remove the files.
create or replace function public.delete_admin_journal_entry(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_paths jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if not exists (select 1 from public.journal_entries e where e.id = p_id and e.author = auth.uid()) then
    raise exception using message = 'You can only delete your own entry.', errcode = '22023';
  end if;
  select coalesce(jsonb_agg(ph.path), '[]'::jsonb) into v_paths from public.journal_photos ph where ph.entry_id = p_id;
  delete from public.journal_entries where id = p_id;
  return jsonb_build_object('photos', v_paths);
end;
$$;

-- A photo the admin has just uploaded to <entry id>/<photo id>.<ext>. Up to 6 an entry.
create or replace function public.add_admin_journal_photo(p_entry_id uuid, p_path text, p_width integer, p_height integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if not exists (select 1 from public.journal_entries e where e.id = p_entry_id and e.author = auth.uid()) then
    raise exception using message = 'You can only add photos to your own entry.', errcode = '22023';
  end if;
  if p_path is null or p_path !~ ('^' || p_entry_id::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$') then
    raise exception using message = 'That photo doesn''t look right.', errcode = '22023';
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 10000 or p_height not between 1 and 10000 then
    raise exception using message = 'That photo doesn''t look right.', errcode = '22023';
  end if;
  if (select count(*) from public.journal_photos ph where ph.entry_id = p_entry_id) >= 6 then
    raise exception using message = 'An entry can have up to 6 photos.', errcode = '22023';
  end if;
  insert into public.journal_photos (entry_id, path, width, height) values (p_entry_id, p_path, p_width, p_height)
  on conflict (path) do nothing;
  return public.journal_entry_json(p_entry_id);
end;
$$;

-- Removes a photo from the caller's own entry. Returns the path (to remove the file) and the entry.
create or replace function public.remove_admin_journal_photo(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_photo public.journal_photos;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  select ph.* into v_photo from public.journal_photos ph join public.journal_entries e on e.id = ph.entry_id
  where ph.id = p_id and e.author = auth.uid();
  if v_photo.id is null then
    raise exception using message = 'You can only remove photos from your own entry.', errcode = '22023';
  end if;
  delete from public.journal_photos where id = p_id;
  return jsonb_build_object('path', v_photo.path, 'entry', public.journal_entry_json(v_photo.entry_id));
end;
$$;

create or replace function public.add_admin_journal_reply(p_entry_id uuid, p_body text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_body text := public.journal_clean_text(p_body);
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if not public.journal_can_see(p_entry_id) then
    raise exception using message = 'That entry isn''t there any more.', errcode = '22023';
  end if;
  if v_body = '' or char_length(v_body) > 1000 then
    raise exception using message = 'A reply is 1 to 1000 characters.', errcode = '22023';
  end if;
  insert into public.journal_replies (entry_id, author, body) values (p_entry_id, auth.uid(), v_body);
  return public.journal_entry_json(p_entry_id);
end;
$$;

create or replace function public.delete_admin_journal_reply(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_entry uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  delete from public.journal_replies where id = p_id and author = auth.uid() returning entry_id into v_entry;
  if v_entry is null then
    raise exception using message = 'You can only delete your own reply.', errcode = '22023';
  end if;
  return public.journal_entry_json(v_entry);
end;
$$;

-- "Keep this one" on or off, for the caller. It shows in Look back.
create or replace function public.set_admin_journal_kept(p_entry_id uuid, p_kept boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if not public.journal_can_see(p_entry_id) then
    raise exception using message = 'That entry isn''t there any more.', errcode = '22023';
  end if;
  if coalesce(p_kept, false) then
    insert into public.journal_keeps (entry_id, admin_id) values (p_entry_id, auth.uid()) on conflict do nothing;
  else
    delete from public.journal_keeps where entry_id = p_entry_id and admin_id = auth.uid();
  end if;
  return public.journal_entry_json(p_entry_id);
end;
$$;

-- A day marked by hand ("First stall at the market"). Any admin can add or remove one.
create or replace function public.save_admin_milestone(p_day date, p_title text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_title text := public.journal_clean_line(p_title);
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_day is null or p_day > public.journal_today() or p_day < date '2026-01-01' then
    raise exception using message = 'Pick a day that has already happened.', errcode = '22023';
  end if;
  if v_title is null or char_length(v_title) > 80 then
    raise exception using message = 'Name the milestone in up to 80 characters.', errcode = '22023';
  end if;
  insert into public.journal_milestones (day, title, created_by) values (p_day, v_title, auth.uid()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'day', p_day, 'kind', 'hand', 'value', 0, 'title', v_title);
end;
$$;

create or replace function public.delete_admin_milestone(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  delete from public.journal_milestones where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 5. To-dos
-- ═══════════════════════════════════════════════════════

-- Every open to-do, and those done in the last p_done_days days.
create or replace function public.get_admin_todos(p_done_days integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  return jsonb_build_object(
    'me', auth.uid(),
    'today', public.journal_today(),
    'people', public.journal_people(),
    'todos', coalesce((
      select jsonb_agg(public.todo_json(t.id) order by t.done_at desc nulls first, t.due_on nulls last, t.created_at, t.id)
      from public.todos t
      where t.deleted_at is null and (
        t.done_at is null
        or t.done_at > timezone('utc', now()) - make_interval(days => least(greatest(coalesce(p_done_days, 7), 0), 60))
      )
    ), '[]'::jsonb)
  );
end;
$$;

-- Makes a to-do (p_id null) or changes one. p_todo: { text, assignee, due_on, entry_id, ingredient_id }.
-- assignee null means either of you. Every key is the whole new value.
create or replace function public.save_admin_todo(p_id uuid, p_todo jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_text text;
  v_assignee uuid;
  v_due date;
  v_entry uuid;
  v_ingredient uuid;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_todo is null or jsonb_typeof(p_todo) <> 'object' then
    raise exception using message = 'That to-do doesn''t look right.', errcode = '22023';
  end if;

  v_text := public.journal_clean_line(p_todo ->> 'text');
  if v_text is null or char_length(v_text) > 200 then
    raise exception using message = 'Say what needs doing, in up to 200 characters.', errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_todo -> 'assignee'), 'null') <> 'null' then
    if (p_todo ->> 'assignee') !~ '^[0-9a-fA-F-]{36}$'
      or not exists (select 1 from public.admin_users a where a.id = (p_todo ->> 'assignee')::uuid) then
      raise exception using message = 'Pick who''s doing it.', errcode = '22023';
    end if;
    v_assignee := (p_todo ->> 'assignee')::uuid;
  end if;

  if coalesce(jsonb_typeof(p_todo -> 'due_on'), 'null') <> 'null' then
    if (p_todo ->> 'due_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using message = 'That day doesn''t look right.', errcode = '22023';
    end if;
    v_due := (p_todo ->> 'due_on')::date;
    if v_due < date '2026-01-01' or v_due > public.journal_today() + 730 then
      raise exception using message = 'That day doesn''t look right.', errcode = '22023';
    end if;
  end if;

  if coalesce(jsonb_typeof(p_todo -> 'entry_id'), 'null') <> 'null' then
    if (p_todo ->> 'entry_id') !~ '^[0-9a-fA-F-]{36}$' or not public.journal_can_see((p_todo ->> 'entry_id')::uuid) then
      raise exception using message = 'That entry isn''t there any more.', errcode = '22023';
    end if;
    v_entry := (p_todo ->> 'entry_id')::uuid;
  end if;

  if coalesce(jsonb_typeof(p_todo -> 'ingredient_id'), 'null') <> 'null' then
    if (p_todo ->> 'ingredient_id') !~ '^[0-9a-fA-F-]{36}$'
      or not exists (select 1 from public.ingredients i where i.id = (p_todo ->> 'ingredient_id')::uuid) then
      raise exception using message = 'That ingredient isn''t on the list any more.', errcode = '22023';
    end if;
    v_ingredient := (p_todo ->> 'ingredient_id')::uuid;
  end if;

  if p_id is null then
    insert into public.todos (body, assignee, due_on, entry_id, ingredient_id, created_by)
    values (v_text, v_assignee, v_due, v_entry, v_ingredient, auth.uid())
    returning id into v_id;
  else
    update public.todos
    set body = v_text, assignee = v_assignee, due_on = v_due, entry_id = v_entry, ingredient_id = v_ingredient,
      updated_at = timezone('utc', now())
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'That to-do isn''t there any more.', errcode = '22023';
    end if;
  end if;
  return public.todo_json(v_id);
end;
$$;

-- Ticks a to-do (or takes the tick off). Done once by anyone is done for everyone.
create or replace function public.set_admin_todo_done(p_id uuid, p_done boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if coalesce(p_done, false) then
    update public.todos set done_at = coalesce(done_at, timezone('utc', now())), done_by = coalesce(done_by, auth.uid()),
      updated_at = timezone('utc', now())
    where id = p_id and deleted_at is null returning id into v_id;
  else
    update public.todos set done_at = null, done_by = null, updated_at = timezone('utc', now())
    where id = p_id and deleted_at is null returning id into v_id;
  end if;
  if v_id is null then
    raise exception using message = 'That to-do isn''t there any more.', errcode = '22023';
  end if;
  return public.todo_json(v_id);
end;
$$;

-- Delete hides it; Undo (p_deleted false) brings it back as it was.
create or replace function public.delete_admin_todo(p_id uuid, p_deleted boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  update public.todos
  set deleted_at = case when coalesce(p_deleted, true) then timezone('utc', now()) else null end,
    updated_at = timezone('utc', now())
  where id = p_id returning id into v_id;
  if v_id is null then
    raise exception using message = 'That to-do isn''t there any more.', errcode = '22023';
  end if;
  return public.todo_json(v_id);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 6. Ingredients
-- ═══════════════════════════════════════════════════════

create or replace function public.ingredients_json()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'kind', i.kind,
        'unit', i.unit,
        'low_at', i.low_at,
        'stock', s.stock,
        'counted_at', s.counted_at,
        'last_bought_on', s.last_bought_on,
        'low', s.stock is not null and i.low_at is not null and s.stock <= i.low_at,
        'uses', coalesce((
          select jsonb_agg(jsonb_build_object('product_id', u.product_id, 'per_kg', u.per_kg) order by u.product_id)
          from public.ingredient_uses u where u.ingredient_id = i.id
        ), '[]'::jsonb),
        -- An open to-do to buy it, if there is one.
        'buying', (
          select public.todo_json(t.id) from public.todos t
          where t.ingredient_id = i.id and t.done_at is null and t.deleted_at is null
          order by t.created_at desc limit 1
        )
      ) order by i.kind, i.position, lower(i.name))
      from public.ingredients i join public.ingredient_stock() s on s.ingredient_id = i.id
    ), '[]'::jsonb),
    -- A usual batch for each product: the average of its last five.
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', b.product_id, 'grams', b.grams) order by b.product_id)
      from (
        select kp.product_id, round(avg(x.grams))::integer as grams
        from public.kitchen_products kp
        join lateral (
          select kb.grams from public.kitchen_batches kb where kb.product_id = kp.product_id
          order by kb.made_on desc, kb.created_at desc limit 5
        ) x on true
        group by kp.product_id
      ) b
    ), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(kp.product_id order by kp.product_id) from public.kitchen_products kp), '[]'::jsonb)
  );
$$;
revoke all on function public.ingredients_json() from public, anon, authenticated;

create or replace function public.get_admin_ingredients()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  return public.ingredients_json();
end;
$$;

-- Adds an ingredient (p_id null) or changes one.
-- p_ingredient: { name, kind: 'food' | 'packaging', low_at, uses: [{ product_id, per_kg }] }.
-- Food is in grams, packaging in pieces. uses is the whole list.
create or replace function public.save_admin_ingredient(p_id uuid, p_ingredient jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_kind text;
  v_low numeric;
  v_use jsonb;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_ingredient is null or jsonb_typeof(p_ingredient) <> 'object' then
    raise exception using message = 'That ingredient doesn''t look right.', errcode = '22023';
  end if;

  v_name := public.journal_clean_line(p_ingredient ->> 'name');
  if v_name is null or char_length(v_name) > 40 then
    raise exception using message = 'Name it in up to 40 characters.', errcode = '22023';
  end if;
  if exists (select 1 from public.ingredients i where lower(i.name) = lower(v_name) and i.id is distinct from p_id) then
    raise exception using message = 'That one is already on the list.', errcode = '22023';
  end if;
  v_kind := coalesce(p_ingredient ->> 'kind', 'food');
  if v_kind not in ('food', 'packaging') then
    raise exception using message = 'That ingredient doesn''t look right.', errcode = '22023';
  end if;
  if jsonb_typeof(p_ingredient -> 'low_at') = 'number' then
    v_low := (p_ingredient ->> 'low_at')::numeric;
    if v_low < 0 or v_low > 10000000 then
      raise exception using message = 'That amount doesn''t look right.', errcode = '22023';
    end if;
  elsif coalesce(jsonb_typeof(p_ingredient -> 'low_at'), 'null') <> 'null' then
    raise exception using message = 'That amount doesn''t look right.', errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_ingredient -> 'uses'), 'null') not in ('array', 'null') then
    raise exception using message = 'Those amounts don''t look right.', errcode = '22023';
  end if;
  for v_use in select * from jsonb_array_elements(coalesce(p_ingredient -> 'uses', '[]'::jsonb)) loop
    if not exists (select 1 from public.kitchen_products kp where kp.product_id = v_use ->> 'product_id')
      or jsonb_typeof(v_use -> 'per_kg') <> 'number'
      or (v_use ->> 'per_kg')::numeric <= 0 or (v_use ->> 'per_kg')::numeric > 1000000 then
      raise exception using message = 'Those amounts don''t look right.', errcode = '22023';
    end if;
  end loop;

  if p_id is null then
    insert into public.ingredients (name, kind, unit, low_at, position)
    values (v_name, v_kind, case when v_kind = 'packaging' then 'pieces' else 'g' end, v_low,
      coalesce((select max(position) + 1 from public.ingredients), 0))
    returning id into v_id;
  else
    update public.ingredients
    set name = v_name, kind = v_kind, unit = case when v_kind = 'packaging' then 'pieces' else 'g' end,
      low_at = v_low, updated_at = timezone('utc', now())
    where id = p_id returning id into v_id;
    if v_id is null then
      raise exception using message = 'That ingredient isn''t on the list any more.', errcode = '22023';
    end if;
  end if;

  delete from public.ingredient_uses where ingredient_id = v_id;
  insert into public.ingredient_uses (ingredient_id, product_id, per_kg)
  select v_id, u ->> 'product_id', max((u ->> 'per_kg')::numeric)
  from jsonb_array_elements(coalesce(p_ingredient -> 'uses', '[]'::jsonb)) u
  group by u ->> 'product_id';

  return public.ingredients_json();
end;
$$;

-- Several names at once (the products' own ingredient lists), food, skipping any already there.
create or replace function public.add_admin_ingredients(p_names text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_names is null or cardinality(p_names) > 60 then
    raise exception using message = 'That list doesn''t look right.', errcode = '22023';
  end if;
  foreach v_name in array p_names loop
    v_name := public.journal_clean_line(v_name);
    if v_name is null or char_length(v_name) > 40 then continue; end if;
    if exists (select 1 from public.ingredients i where lower(i.name) = lower(v_name)) then continue; end if;
    insert into public.ingredients (name, kind, unit, position)
    values (v_name, 'food', 'g', coalesce((select max(position) + 1 from public.ingredients), 0));
  end loop;
  return public.ingredients_json();
end;
$$;

-- Takes an ingredient off the list. Lines and to-dos that named it keep their words.
create or replace function public.delete_admin_ingredient(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  delete from public.ingredients where id = p_id;
  return public.ingredients_json();
end;
$$;

-- A count by hand: from now on, stock starts from this amount. Undo removes it.
create or replace function public.count_admin_ingredient(p_id uuid, p_amount numeric)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_count uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if not exists (select 1 from public.ingredients i where i.id = p_id) then
    raise exception using message = 'That ingredient isn''t on the list any more.', errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then
    raise exception using message = 'That amount doesn''t look right.', errcode = '22023';
  end if;
  insert into public.ingredient_counts (ingredient_id, amount, counted_by)
  values (p_id, round(p_amount, 2), auth.uid()) returning id into v_count;
  return public.ingredients_json() || jsonb_build_object('count_id', v_count);
end;
$$;

create or replace function public.uncount_admin_ingredient(p_count_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  delete from public.ingredient_counts where id = p_count_id;
  return public.ingredients_json();
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 7. Home: what else is waiting on you
-- ═══════════════════════════════════════════════════════

-- The caller's open to-dos (theirs or either's) that are late or due within a week,
-- how many others are open for them, the ingredients running low, and whether
-- they've written today.
create or replace function public.get_admin_home_extras()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := public.journal_today();
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'todos', coalesce((
      select jsonb_agg(public.todo_json(t.id) order by t.due_on, t.created_at, t.id)
      from public.todos t
      where t.deleted_at is null and t.done_at is null
        and (t.assignee is null or t.assignee = auth.uid())
        and t.due_on is not null and t.due_on <= v_today + 6
    ), '[]'::jsonb),
    'later', (select count(*) from public.todos t
      where t.deleted_at is null and t.done_at is null
        and (t.assignee is null or t.assignee = auth.uid())
        and (t.due_on is null or t.due_on > v_today + 6)),
    'low', coalesce((
      select jsonb_agg(x.j order by x.name)
      from (
        select lower(i.name) as name, jsonb_build_object(
          'id', i.id, 'name', i.name, 'unit', i.unit, 'stock', s.stock,
          'buying', exists (select 1 from public.todos t where t.ingredient_id = i.id and t.done_at is null and t.deleted_at is null)
        ) as j
        from public.ingredients i join public.ingredient_stock() s on s.ingredient_id = i.id
        where s.stock is not null and i.low_at is not null and s.stock <= i.low_at
      ) x
    ), '[]'::jsonb),
    'wrote_today', exists (select 1 from public.journal_entries e where e.author = auth.uid() and e.day = v_today)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 8. Who can call what
-- ═══════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_admin_journal(date, integer)',
    'public.get_admin_journal_lookback()',
    'public.get_admin_journal_month(date)',
    'public.search_admin_journal(text, uuid, text, boolean, boolean, integer)',
    'public.get_admin_work_days(date)',
    'public.save_admin_journal_entry(date, jsonb)',
    'public.delete_admin_journal_entry(uuid)',
    'public.add_admin_journal_photo(uuid, text, integer, integer)',
    'public.remove_admin_journal_photo(uuid)',
    'public.add_admin_journal_reply(uuid, text)',
    'public.delete_admin_journal_reply(uuid)',
    'public.set_admin_journal_kept(uuid, boolean)',
    'public.save_admin_milestone(date, text)',
    'public.delete_admin_milestone(uuid)',
    'public.get_admin_todos(integer)',
    'public.save_admin_todo(uuid, jsonb)',
    'public.set_admin_todo_done(uuid, boolean)',
    'public.delete_admin_todo(uuid, boolean)',
    'public.get_admin_ingredients()',
    'public.save_admin_ingredient(uuid, jsonb)',
    'public.add_admin_ingredients(text[])',
    'public.delete_admin_ingredient(uuid)',
    'public.count_admin_ingredient(uuid, numeric)',
    'public.uncount_admin_ingredient(uuid)',
    'public.get_admin_home_extras()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 9. Photos: a private Storage bucket
-- ═══════════════════════════════════════════════════════
-- Files live at <entry id>/<photo id>.<ext>. An admin can read a photo when they can see
-- its entry, and only the entry's author can upload or remove one. The checks are
-- functions so the policies stay short. Skipped where Storage isn't installed.

create or replace function public.journal_photo_entry(p_name text)
returns uuid language sql immutable set search_path = public as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(p_name, '/', 1)::uuid end;
$$;

create or replace function public.journal_photo_readable(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and public.journal_can_see(public.journal_photo_entry(p_name));
$$;

create or replace function public.journal_photo_writable(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and exists (
    select 1 from public.journal_entries e where e.id = public.journal_photo_entry(p_name) and e.author = auth.uid()
  );
$$;

revoke all on function public.journal_photo_entry(text) from public, anon;
revoke all on function public.journal_photo_readable(text) from public, anon;
revoke all on function public.journal_photo_writable(text) from public, anon;
grant execute on function public.journal_photo_entry(text) to authenticated;
grant execute on function public.journal_photo_readable(text) to authenticated;
grant execute on function public.journal_photo_writable(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage is not installed here: the journal photo bucket was skipped.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('journal', 'journal', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "journal photos: admins who can see the entry read" on storage.objects;
  drop policy if exists "journal photos: the author uploads" on storage.objects;
  drop policy if exists "journal photos: the author removes" on storage.objects;

  create policy "journal photos: admins who can see the entry read" on storage.objects
    for select to authenticated
    using (bucket_id = 'journal' and public.journal_photo_readable(name));
  create policy "journal photos: the author uploads" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'journal' and public.journal_photo_writable(name));
  create policy "journal photos: the author removes" on storage.objects
    for delete to authenticated
    using (bucket_id = 'journal' and public.journal_photo_writable(name));
end;
$$;
