export type Profile = {
  id: string
  cadet_name: string
  goal_type: 'daily' | 'weekly' | 'challenge'
  goal_target: number
  daily_goal: number
  weekly_goal: number
  challenge_goal: number
}

export type LeaderboardEntry = {
  user_id: string
  cadet_name: string
  total_reps: number
}

export type DashboardStats = {
  today_total: number
  week_total: number
  all_time_total: number
  current_streak: number
  best_streak: number
  days_logged: number
}
