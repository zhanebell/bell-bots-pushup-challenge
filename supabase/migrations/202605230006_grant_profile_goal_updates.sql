grant usage on schema public to authenticated;

-- Allow logged-in users to update only their goal settings.
grant update (goal_type, goal_target) on public.profiles to authenticated;
