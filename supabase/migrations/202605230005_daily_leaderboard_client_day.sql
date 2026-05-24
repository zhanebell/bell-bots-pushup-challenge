create or replace function public.get_daily_leaderboard(p_client_today date default current_date)
returns table (
  user_id uuid,
  cadet_name text,
  total_reps integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.cadet_name,
    coalesce(sum(e.reps), 0)::integer as total_reps
  from public.profiles p
  left join public.pushup_entries e
    on p.id = e.user_id
   and e.entry_date = p_client_today
  group by p.id, p.cadet_name
  order by total_reps desc, p.cadet_name asc;
$$;

grant execute on function public.get_daily_leaderboard(date) to authenticated;
