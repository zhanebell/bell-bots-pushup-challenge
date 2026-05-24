create extension if not exists pgcrypto;

create or replace function public.normalize_cadet_name(raw_name text)
returns text
language plpgsql
immutable
as $$
declare
  stripped text;
begin
  stripped := trim(regexp_replace(coalesce(raw_name, ''), '^C/', '', 'i'));
  if stripped = '' then
    return 'C/Unknown';
  end if;
  return 'C/' || stripped;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cadet_name text not null unique,
  daily_goal integer not null default 50 check (daily_goal >= 0),
  weekly_goal integer not null default 350 check (weekly_goal >= 0),
  challenge_goal integer not null default 5000 check (challenge_goal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pushup_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  reps integer not null check (reps > 0 and reps <= 1000),
  session_seconds integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_pushup_entries_user_date on public.pushup_entries (user_id, entry_date);
create index if not exists idx_pushup_entries_date on public.pushup_entries (entry_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.normalize_profile_name()
returns trigger
language plpgsql
as $$
begin
  new.cadet_name = public.normalize_cadet_name(new.cadet_name);
  return new;
end;
$$;

drop trigger if exists trg_profiles_name_normalize on public.profiles;
create trigger trg_profiles_name_normalize
before insert or update on public.profiles
for each row
execute function public.normalize_profile_name();

create or replace function public.ensure_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, cadet_name)
  values (
    new.id,
    public.normalize_cadet_name(coalesce(new.raw_user_meta_data ->> 'cadet_name', 'Unknown'))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.ensure_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.pushup_entries enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "entries readable by authenticated" on public.pushup_entries;
create policy "entries readable by authenticated"
on public.pushup_entries
for select
to authenticated
using (true);

create or replace function public.add_pushup_entry(
  p_entry_date date,
  p_reps integer,
  p_session_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_entry_date < current_date - 1 or p_entry_date > current_date then
    raise exception 'Entry date must be today or yesterday';
  end if;

  if p_reps <= 0 or p_reps > 1000 then
    raise exception 'Reps must be 1..1000';
  end if;

  select count(*)
  into v_count
  from public.pushup_entries
  where user_id = v_uid
    and created_at >= now() - interval '1 minute';

  if v_count >= 20 then
    raise exception 'Rate limit exceeded. Try again in a minute.';
  end if;

  insert into public.pushup_entries(user_id, entry_date, reps, session_seconds)
  values (v_uid, p_entry_date, p_reps, p_session_seconds);
end;
$$;

grant execute on function public.add_pushup_entry(date, integer, integer) to authenticated;

create or replace view public.all_time_leaderboard as
select
  p.id as user_id,
  p.cadet_name,
  coalesce(sum(e.reps), 0)::integer as total_reps
from public.profiles p
left join public.pushup_entries e on p.id = e.user_id
group by p.id, p.cadet_name;

create or replace view public.weekly_leaderboard as
select
  p.id as user_id,
  p.cadet_name,
  coalesce(sum(e.reps), 0)::integer as total_reps
from public.profiles p
left join public.pushup_entries e
  on p.id = e.user_id
 and e.entry_date >= date_trunc('week', current_date)::date
 and e.entry_date < (date_trunc('week', current_date)::date + interval '7 day')
group by p.id, p.cadet_name;

create or replace view public.daily_leaderboard as
select
  p.id as user_id,
  p.cadet_name,
  coalesce(sum(e.reps), 0)::integer as total_reps
from public.profiles p
left join public.pushup_entries e
  on p.id = e.user_id
 and e.entry_date = current_date
group by p.id, p.cadet_name;

create or replace function public.get_user_stats(p_user_id uuid)
returns table(
  today_total integer,
  week_total integer,
  all_time_total integer,
  current_streak integer,
  best_streak integer,
  days_logged integer
)
language sql
stable
security definer
set search_path = public
as $$
with daily as (
  select
    entry_date,
    sum(reps)::integer as reps
  from public.pushup_entries
  where user_id = p_user_id
  group by entry_date
),
summary as (
  select
    coalesce((select sum(reps) from daily where entry_date = current_date), 0)::integer as tday,
    coalesce((select sum(reps) from daily where entry_date >= date_trunc('week', current_date)::date and entry_date < (date_trunc('week', current_date)::date + interval '7 day')), 0)::integer as wk,
    coalesce((select sum(reps) from daily), 0)::integer as all_t,
    coalesce((select count(*) from daily), 0)::integer as days
),
current_streak_calc as (
  with recursive s(day_value) as (
    select current_date
    where exists (select 1 from daily where entry_date = current_date)
    union all
    select day_value - 1
    from s
    where exists (
      select 1 from daily where entry_date = day_value - 1
    )
  )
  select count(*)::integer as cur from s
),
seq as (
  select
    entry_date,
    row_number() over (order by entry_date) as rn
  from daily
),
streak_groups as (
  select
    entry_date,
    (entry_date - (rn || ' day')::interval)::date as grp
  from seq
),
streaks as (
  select count(*)::integer as streak_len
  from streak_groups
  group by grp
),
current_calc as (select coalesce((select cur from current_streak_calc), 0) as cur)
select
  s.tday,
  s.wk,
  s.all_t,
  c.cur as current_streak,
  coalesce((select max(streak_len) from streaks), 0)::integer as best_streak,
  s.days
from summary s
cross join current_calc c;
$$;

grant execute on function public.get_user_stats(uuid) to authenticated;
