import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type { Session, User } from '@supabase/supabase-js'
import { motivationLines, dynamicMotivation } from './data/motivation'
import { supabase } from './lib/supabase'
import type { DashboardStats, LeaderboardEntry, Profile } from './types'

dayjs.extend(isoWeek)

const challengeStart = dayjs('2026-05-24')
const challengeEnd = dayjs('2026-08-24')

const getTodayISO = () => dayjs().format('YYYY-MM-DD')
const getYesterdayISO = () => dayjs().subtract(1, 'day').format('YYYY-MM-DD')

const emptyStats: DashboardStats = {
  today_total: 0,
  week_total: 0,
  all_time_total: 0,
  current_streak: 0,
  best_streak: 0,
  days_logged: 0,
}

const formatTimer = (ms: number) => {
  const cs = Math.floor(ms / 10) % 100
  const s = Math.floor(ms / 1000) % 60
  const m = Math.floor(ms / 60000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const normalizeCadetName = (input: string) => {
  const trimmed = input.trim().replace(/^C\//i, '')
  return `C/${trimmed}`
}

type GoalType = 'daily' | 'weekly' | 'challenge'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({})

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cadetName, setCadetName] = useState('')
  const [isSignup, setIsSignup] = useState(true)
  const [authMsg, setAuthMsg] = useState('')

  const [monthCursor, setMonthCursor] = useState(dayjs().startOf('month'))
  const [selectedEditDate, setSelectedEditDate] = useState<string | null>(getTodayISO())
  const [editTotalReps, setEditTotalReps] = useState('0')
  const [isDayEditOpen, setIsDayEditOpen] = useState(false)
  const [dayEditMsg, setDayEditMsg] = useState('')

  const [timerRunning, setTimerRunning] = useState(false)
  const [timerStart, setTimerStart] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [timerDisplay, setTimerDisplay] = useState('00:00.00')
  const [sessionReps, setSessionReps] = useState(0)
  const [isTimerFullscreen, setIsTimerFullscreen] = useState(false)

  const [allTimeBoard, setAllTimeBoard] = useState<LeaderboardEntry[]>([])
  const [weekBoard, setWeekBoard] = useState<LeaderboardEntry[]>([])
  const [dayBoard, setDayBoard] = useState<LeaderboardEntry[]>([])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboards' | 'badges'>('dashboard')

  const [info, setInfo] = useState('')
  const timerPanelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      if (!timerRunning) {
        return
      }
      const ms = elapsed + (Date.now() - timerStart)
      setTimerDisplay(formatTimer(ms))
    }, 10)
    return () => clearInterval(interval)
  }, [elapsed, timerRunning, timerStart])

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && user) {
        e.preventDefault()
        setSessionReps((prev) => prev + 1)
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
  }, [user])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsTimerFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      setUser(data.session?.user ?? null)
    }

    initAuth()
    const { data: listener } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const computeStats = (totals: Record<string, number>) => {
    const todayISO = getTodayISO()
    const weekStart = dayjs().startOf('isoWeek')
    const weekEnd = dayjs().endOf('isoWeek')

    let weekTotal = 0
    let allTimeTotal = 0
    let daysLogged = 0

    Object.entries(totals).forEach(([date, reps]) => {
      const d = dayjs(date)
      allTimeTotal += reps
      if ((d.isSame(weekStart, 'day') || d.isAfter(weekStart, 'day')) && (d.isSame(weekEnd, 'day') || d.isBefore(weekEnd, 'day'))) {
        weekTotal += reps
      }
      if (reps > 0) {
        daysLogged += 1
      }
    })

    let currentStreak = 0
    if ((totals[todayISO] ?? 0) > 0) {
      let cursor = dayjs(todayISO)
      while ((totals[cursor.format('YYYY-MM-DD')] ?? 0) > 0) {
        currentStreak += 1
        cursor = cursor.subtract(1, 'day')
      }
    }

    const dates = Object.keys(totals)
      .filter((k) => totals[k] > 0)
      .sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())

    let bestStreak = 0
    let running = 0
    for (let i = 0; i < dates.length; i += 1) {
      if (i === 0) {
        running = 1
      } else {
        running = dayjs(dates[i]).diff(dayjs(dates[i - 1]), 'day') === 1 ? running + 1 : 1
      }
      if (running > bestStreak) {
        bestStreak = running
      }
    }

    return {
      today_total: totals[todayISO] ?? 0,
      week_total: weekTotal,
      all_time_total: allTimeTotal,
      current_streak: currentStreak,
      best_streak: bestStreak,
      days_logged: daysLogged,
    }
  }

  const loadDashboard = async (currentUser: User) => {
    const [{ data: profileData }, { data: entriesData }, { data: allData }, { data: weekData }, { data: dayData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,cadet_name,goal_type,goal_target,daily_goal,weekly_goal,challenge_goal')
        .eq('id', currentUser.id)
        .single(),
      supabase
        .from('pushup_entries')
        .select('entry_date,reps')
        .eq('user_id', currentUser.id),
      supabase.from('all_time_leaderboard').select('user_id,cadet_name,total_reps').order('total_reps', { ascending: false }),
      supabase.from('weekly_leaderboard').select('user_id,cadet_name,total_reps').order('total_reps', { ascending: false }),
      supabase.rpc('get_daily_leaderboard', { p_client_today: getTodayISO() }),
    ])

    if (profileData) {
      setProfile(profileData as Profile)
    }

    const totals: Record<string, number> = {}
    ;((entriesData as Array<{ entry_date: string; reps: number }>) ?? []).forEach((row) => {
      totals[row.entry_date] = (totals[row.entry_date] ?? 0) + Number(row.reps)
    })
    setDailyTotals(totals)
    setStats(computeStats(totals))

    if (selectedEditDate) {
      setEditTotalReps(String(totals[selectedEditDate] ?? 0))
    }

    setAllTimeBoard((allData as LeaderboardEntry[]) ?? [])
    setWeekBoard((weekData as LeaderboardEntry[]) ?? [])
    setDayBoard((dayData as LeaderboardEntry[]) ?? [])
  }

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setStats(emptyStats)
      setDailyTotals({})
      return
    }

    loadDashboard(user)
    const channel = supabase
      .channel('leaderboards-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pushup_entries' }, async () => {
        await loadDashboard(user)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault()
    setAuthMsg('')
    if (isSignup) {
      if (!cadetName.trim()) {
        setAuthMsg('Cadet name is required for signup.')
        return
      }
      const normalized = normalizeCadetName(cadetName)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { cadet_name: normalized } },
      })
      if (error) {
        setAuthMsg(error.message)
        return
      }
      if (data.user && data.session) {
        await supabase.from('profiles').upsert({ id: data.user.id, cadet_name: normalized })
      }
      setAuthMsg('Signup success. Check email confirmation if enabled.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthMsg(error.message)
      return
    }
    setAuthMsg('Signed in.')
  }

  const toggleTimer = () => {
    if (!timerRunning) {
      setTimerStart(Date.now())
      setTimerRunning(true)
      return
    }
    setElapsed((prev) => prev + (Date.now() - timerStart))
    setTimerRunning(false)
  }

  const resetTimer = () => {
    setTimerRunning(false)
    setElapsed(0)
    setTimerStart(0)
    setTimerDisplay('00:00.00')
    setSessionReps(0)
  }

  const saveDayTotal = async () => {
    const todayISO = getTodayISO()
    const yesterdayISO = getYesterdayISO()

    if (!user) {
      setDayEditMsg('Not signed in.')
      return false
    }
    if (!selectedEditDate) {
      setInfo('Pick a day first.')
      setDayEditMsg('Pick a day first.')
      return false
    }
    if (selectedEditDate !== todayISO && selectedEditDate !== yesterdayISO) {
      setInfo('Only today or yesterday can be edited.')
      setDayEditMsg('Only today or yesterday can be edited.')
      return false
    }
    const total = Number(editTotalReps)
    if (!Number.isFinite(total) || total < 0) {
      setInfo('Total reps must be zero or higher.')
      setDayEditMsg('Total reps must be zero or higher.')
      return false
    }
    const { error } = await supabase.rpc('set_pushup_day_total', {
      p_entry_date: selectedEditDate,
      p_total_reps: total,
      p_client_today: todayISO,
    })
    if (error) {
      setInfo(error.message)
      setDayEditMsg(error.message)
      return false
    }
    setInfo(`Saved ${total} reps for ${selectedEditDate}.`)
    setDayEditMsg(`Saved ${total} reps.`)
    await loadDashboard(user)
    return true
  }

  const finishSession = async () => {
    const todayISO = getTodayISO()

    if (!user) {
      return
    }
    const ms = timerRunning ? elapsed + (Date.now() - timerStart) : elapsed
    const seconds = Math.round(ms / 1000)
    if (sessionReps <= 0) {
      setInfo('Session has zero reps. Add reps before finishing.')
      return
    }
    const { error } = await supabase.rpc('add_pushup_entry', {
      p_entry_date: todayISO,
      p_reps: sessionReps,
      p_session_seconds: seconds,
      p_client_today: todayISO,
    })
    if (error) {
      setInfo(error.message)
      return
    }
    setInfo(`Session saved: ${sessionReps} reps in ${formatTimer(ms)}.`)
    resetTimer()
    await loadDashboard(user)
  }

  const saveGoal = async (goal: { goal_type: GoalType; goal_target: number }) => {
    if (!user) {
      return
    }
    const { error } = await supabase.from('profiles').update(goal).eq('id', user.id)
    if (error) {
      setInfo(error.message)
      return
    }
    setInfo('Goal updated.')
    await loadDashboard(user)
  }

  const toggleTimerFullscreen = async () => {
    if (!timerPanelRef.current) {
      return
    }
    if (!document.fullscreenElement) {
      await timerPanelRef.current.requestFullscreen()
      return
    }
    await document.exitFullscreen()
  }

  const monthDays = useMemo(() => {
    const start = monthCursor.startOf('month').startOf('week')
    const end = monthCursor.endOf('month').endOf('week')
    const days: dayjs.Dayjs[] = []
    let cursor = start
    while (cursor.isSame(end, 'day') || cursor.isBefore(end, 'day')) {
      days.push(cursor)
      cursor = cursor.add(1, 'day')
    }
    return days
  }, [monthCursor])

  const requiredForDay = (day: dayjs.Dayjs) => {
    if (!profile || profile.goal_target <= 0) {
      return 0
    }

    const mode = (profile.goal_type ?? 'challenge') as GoalType
    const target = profile.goal_target
    const dayKey = day.format('YYYY-MM-DD')

    if (mode === 'daily') {
      return Math.max(target - (dailyTotals[dayKey] ?? 0), 0)
    }

    if (mode === 'weekly') {
      const weekStart = day.startOf('isoWeek')
      const weekEnd = day.endOf('isoWeek')
      let weekSoFar = 0
      Object.entries(dailyTotals).forEach(([date, reps]) => {
        const d = dayjs(date)
        if ((d.isSame(weekStart, 'day') || d.isAfter(weekStart, 'day')) && (d.isSame(day, 'day') || d.isBefore(day, 'day')) && (d.isSame(weekEnd, 'day') || d.isBefore(weekEnd, 'day'))) {
          weekSoFar += reps
        }
      })
      const daysLeft = Math.max(weekEnd.diff(day, 'day') + 1, 1)
      return Math.max(Math.ceil((target - weekSoFar) / daysLeft), 0)
    }

    let challengeSoFar = 0
    Object.entries(dailyTotals).forEach(([date, reps]) => {
      const d = dayjs(date)
      if ((d.isSame(challengeStart, 'day') || d.isAfter(challengeStart, 'day')) && (d.isSame(day, 'day') || d.isBefore(day, 'day'))) {
        challengeSoFar += reps
      }
    })
    const daysLeft = Math.max(challengeEnd.diff(day, 'day') + 1, 1)
    return Math.max(Math.ceil((target - challengeSoFar) / daysLeft), 0)
  }

  const randomStaticLine = useMemo(() => {
    return motivationLines[(new Date().getDate() + new Date().getHours()) % motivationLines.length]
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="top-label">C/Bell&apos;s Push-Up Challenge</p>
          <h1>Summer Mission Board</h1>
        </div>
        {session ? <button className="ghost" onClick={async () => supabase.auth.signOut()}>Sign Out</button> : null}
      </header>

      {session ? (
        <nav className="top-tabs card" aria-label="Primary Tabs">
          <button className={activeTab === 'dashboard' ? '' : 'ghost'} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={activeTab === 'leaderboards' ? '' : 'ghost'} onClick={() => setActiveTab('leaderboards')}>Leaderboards</button>
          <button className={activeTab === 'badges' ? '' : 'ghost'} onClick={() => setActiveTab('badges')}>Badges</button>
        </nav>
      ) : null}

      <section className="mission card">
        <h2>Mission Brief</h2>
        <p>
          Built by C/Bell to drive competition, morale, and fitness over summer break. Challenge window is {challengeStart.format('MMM D')} to {challengeEnd.format('MMM D, YYYY')}. Integrity First: only honest reps count.
        </p>
      </section>

      {!session ? (
        <section className="card auth-card">
          <h2>{isSignup ? 'Create Account' : 'Sign In'}</h2>
          <form onSubmit={handleAuth}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </label>
            {isSignup ? (
              <label>
                Cadet Name
                <input type="text" placeholder="C/Last, First" value={cadetName} onChange={(e) => setCadetName(e.target.value)} required />
              </label>
            ) : null}
            <button type="submit">{isSignup ? 'Sign Up' : 'Sign In'}</button>
          </form>
          <button className="ghost" onClick={() => setIsSignup((prev) => !prev)}>
            {isSignup ? 'Already have account? Sign in' : 'Need account? Sign up'}
          </button>
          <p className="meta">{authMsg}</p>
        </section>
      ) : activeTab === 'dashboard' ? (
        <>
          <section className="kpi-grid">
            <article className="card"><h3>Today</h3><strong>{stats.today_total}</strong><p>reps</p></article>
            <article className="card"><h3>This Week</h3><strong>{stats.week_total}</strong><p>reps</p></article>
            <article className="card"><h3>All Time</h3><strong>{stats.all_time_total}</strong><p>reps</p></article>
            <article className="card"><h3>Current Streak</h3><strong>{stats.current_streak}</strong><p>days</p></article>
          </section>

          <section className="insights-grid">
            <section className="card message-card">
              <h2>Motivation Feed</h2>
              <p>{dynamicMotivation({ today: stats.today_total, week: stats.week_total, streak: stats.current_streak, goal: (profile?.goal_type ?? 'challenge') === 'daily' ? profile?.goal_target ?? 0 : 0 })}</p>
              <p className="meta">{randomStaticLine}</p>
            </section>

            <section className="card goals-card">
              <h2>Goal Settings</h2>
              <SingleGoalEditor profile={profile} onSave={saveGoal} />
            </section>
          </section>

          <section ref={timerPanelRef} className="timer-grid card">
            <div className="timer-side">
              <p className="top-label">SESSION TIMER</p>
              <p className="display">{timerDisplay}</p>
              <div className="controls">
                <button onClick={toggleTimer}>{timerRunning ? 'STOP' : 'START'}</button>
                <button className="ghost" onClick={toggleTimerFullscreen}>{isTimerFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}</button>
                <button onClick={finishSession}>FINISH SESSION</button>
              </div>
            </div>
            <div className="timer-side push-side" onClick={() => setSessionReps((prev) => prev + 1)}>
              <p className="top-label">PUSH-UPS</p>
              <p className="display">{sessionReps}</p>
              <p className="meta">Click side or press Space</p>
            </div>
          </section>

          <section className="card calendar-card">
            <div className="calendar-head">
              <h2>Calendar Log</h2>
              <div className="controls">
                <button className="ghost" onClick={() => setMonthCursor((prev) => prev.subtract(1, 'month'))}>Prev</button>
                <p className="calendar-month">{monthCursor.format('MMMM YYYY')}</p>
                <button className="ghost" onClick={() => setMonthCursor((prev) => prev.add(1, 'month'))}>Next</button>
              </div>
            </div>

            <div className="weekdays">
              <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
            </div>

            <div className="calendar-grid">
              {monthDays.map((day) => {
                const todayISO = getTodayISO()
                const yesterdayISO = getYesterdayISO()
                const dateKey = day.format('YYYY-MM-DD')
                const reps = dailyTotals[dateKey] ?? 0
                const editable = dateKey === todayISO || dateKey === yesterdayISO
                const selected = selectedEditDate === dateKey
                const inMonth = day.isSame(monthCursor, 'month')
                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`day-cell${selected ? ' selected' : ''}${editable ? ' editable' : ''}${inMonth ? '' : ' muted'}`}
                    onClick={() => {
                      if (!editable) {
                        return
                      }
                      setSelectedEditDate(dateKey)
                      setEditTotalReps(String(reps))
                      setDayEditMsg('')
                      setIsDayEditOpen(true)
                    }}
                  >
                    <span className="day-number">{day.date()}</span>
                    <span className="day-reps">{reps} reps</span>
                    <span className="day-needed">Need avg: {requiredForDay(day)}</span>
                  </button>
                )
              })}
            </div>
            <p className="meta">{info}</p>
          </section>

          {isDayEditOpen && selectedEditDate ? (
            <div className="modal-backdrop" onClick={() => setIsDayEditOpen(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <h2>Edit Day</h2>
                <p className="meta">{selectedEditDate}</p>
                <label>
                  Total Reps
                  <input
                    type="number"
                    min={0}
                    value={editTotalReps}
                    onChange={(e) => setEditTotalReps(e.target.value)}
                  />
                </label>
                <div className="quick-add-row">
                  {[1, 5, 25, 50].map((inc) => (
                    <button
                      key={inc}
                      className="ghost"
                      onClick={() => {
                        const current = Number(editTotalReps || 0)
                        setEditTotalReps(String(Math.max(current + inc, 0)))
                      }}
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
                <div className="controls">
                  <button
                    onClick={async () => {
                      const ok = await saveDayTotal()
                      if (ok) {
                        setIsDayEditOpen(false)
                      }
                    }}
                  >
                    Save
                  </button>
                  <button className="ghost" onClick={() => setIsDayEditOpen(false)}>Close</button>
                </div>
                {dayEditMsg ? <p className="meta">{dayEditMsg}</p> : null}
              </div>
            </div>
          ) : null}

        </>
      ) : activeTab === 'leaderboards' ? (
        <section className="board-grid">
          <Leaderboard title="Daily Leaderboard" rows={dayBoard} />
          <Leaderboard title="Weekly Leaderboard" rows={weekBoard} />
          <Leaderboard title="All-Time Leaderboard" rows={allTimeBoard} />
        </section>
      ) : (
        <section className="card badges-card">
          <h2>Badge Track</h2>
          <div className="badges">
            <span className={stats.current_streak >= 3 ? 'badge on' : 'badge'}>3-Day Streak</span>
            <span className={stats.current_streak >= 7 ? 'badge on' : 'badge'}>7-Day Consistency</span>
            <span className={stats.week_total >= 250 ? 'badge on' : 'badge'}>Weekly 250</span>
            <span className={stats.all_time_total >= 1000 ? 'badge on' : 'badge'}>1000 Milestone</span>
            <span className={stats.best_streak >= 14 ? 'badge on' : 'badge'}>Iron Discipline</span>
          </div>
        </section>
      )}
    </main>
  )
}

function SingleGoalEditor({
  profile,
  onSave,
}: {
  profile: Profile | null
  onSave: (goal: { goal_type: GoalType; goal_target: number }) => Promise<void>
}) {
  const [goalType, setGoalType] = useState<GoalType>((profile?.goal_type as GoalType) ?? 'challenge')
  const [goalTarget, setGoalTarget] = useState(profile?.goal_target ?? 5000)

  useEffect(() => {
    setGoalType((profile?.goal_type as GoalType) ?? 'challenge')
    setGoalTarget(profile?.goal_target ?? 5000)
  }, [profile])

  const goalHint =
    goalType === 'daily'
      ? 'Daily goal: target reps every day. Calendar shows reps remaining for each day.'
      : goalType === 'weekly'
        ? 'Weekly goal: target reps per week. Calendar shows average reps needed per remaining day in that week.'
        : 'Challenge goal: one total target by challenge end date. Calendar shows average reps needed per remaining day.'

  return (
    <div className="row">
      <label>
        Goal Type
        <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="challenge">Challenge</option>
        </select>
      </label>
      <label>
        Goal Target
        <input type="number" min={0} value={goalTarget} onChange={(e) => setGoalTarget(Number(e.target.value))} />
      </label>
      <button onClick={() => onSave({ goal_type: goalType, goal_target: goalTarget })}>Save Goal</button>
      <p className="meta goal-hint">{goalHint}</p>
    </div>
  )
}

function Leaderboard({ title, rows }: { title: string; rows: LeaderboardEntry[] }) {
  return (
    <article className="card">
      <h2>{title}</h2>
      <ol className="board-list">
        {rows.slice(0, 20).map((row) => (
          <li key={`${title}-${row.user_id}`}>
            <span>{row.cadet_name}</span>
            <strong>{row.total_reps}</strong>
          </li>
        ))}
      </ol>
    </article>
  )
}

export default App
