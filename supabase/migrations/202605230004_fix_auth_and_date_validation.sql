grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.pushup_entries to authenticated;

grant select on public.daily_leaderboard to anon, authenticated;
grant select on public.weekly_leaderboard to anon, authenticated;
grant select on public.all_time_leaderboard to anon, authenticated;

create or replace function public.add_pushup_entry(
  p_entry_date date,
  p_reps integer,
  p_session_seconds integer default null,
  p_client_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer;
  v_today date;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_today := coalesce(p_client_today, current_date);

  if p_entry_date < v_today - 1 or p_entry_date > v_today then
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

grant execute on function public.add_pushup_entry(date, integer, integer, date) to authenticated;

create or replace function public.set_pushup_day_total(
  p_entry_date date,
  p_total_reps integer,
  p_client_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_today date;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_today := coalesce(p_client_today, current_date);

  if p_entry_date < v_today - 1 or p_entry_date > v_today then
    raise exception 'Only today or yesterday can be edited';
  end if;

  if p_total_reps < 0 or p_total_reps > 5000 then
    raise exception 'Total reps must be 0..5000';
  end if;

  delete from public.pushup_entries
  where user_id = v_uid
    and entry_date = p_entry_date;

  if p_total_reps > 0 then
    insert into public.pushup_entries(user_id, entry_date, reps, session_seconds)
    values (v_uid, p_entry_date, p_total_reps, null);
  end if;
end;
$$;

grant execute on function public.set_pushup_day_total(date, integer, date) to authenticated;
