alter table public.profiles
  add column if not exists goal_type text not null default 'challenge'
  check (goal_type in ('daily', 'weekly', 'challenge'));

alter table public.profiles
  add column if not exists goal_target integer not null default 5000
  check (goal_target >= 0);

update public.profiles
set goal_target = coalesce(challenge_goal, 5000)
where goal_target = 5000
  and challenge_goal is not null;

create or replace function public.set_pushup_day_total(
  p_entry_date date,
  p_total_reps integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_entry_date < current_date - 1 or p_entry_date > current_date then
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

grant execute on function public.set_pushup_day_total(date, integer) to authenticated;
