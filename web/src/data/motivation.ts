export const motivationLines = [
  'Integrity first. Honest reps build real strength.',
  'One clean set today beats excuses tomorrow.',
  'Discipline compounds. Keep stacking days.',
  'Pressure is a privilege. Own this session.',
  'Your future self is watching this rep.',
  'Consistency wins long challenges.',
  'Strong habits beat strong moods.',
  'No shortcuts. Just standards.',
  'A focused 10 minutes changes the day.',
  'Small effort, repeated daily, becomes elite.',
  'You are not chasing comfort. You are chasing growth.',
  'Cadet mindset: execute, report, improve.',
]

export const dynamicMotivation = ({
  today,
  week,
  streak,
  goal,
}: {
  today: number
  week: number
  streak: number
  goal: number
}) => {
  if (goal > 0 && today >= goal) {
    return 'Daily goal complete. Keep moving and bank extra reps.'
  }

  if (streak >= 7) {
    return `Seven-day-plus streak (${streak}). You are setting the tone.`
  }

  if (week >= 250) {
    return `Weekly volume is high at ${week}. Stay honest and finish strong.`
  }

  if (today === 0) {
    return 'Mission not started today. First set starts momentum.'
  }

  return `You have ${today} reps today. One more clean set before you log off.`
}
