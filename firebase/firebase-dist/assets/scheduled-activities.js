export function isNewHirePresentation(entry) {
  return ['Other Team Work', 'Team Task', 'Team Tasks'].includes(entry?.activity) &&
    /^(?:Committee Work — )?New Hire Class Presentation(?:$| —)/i.test(entry.detail || '');
}
const centralDay = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(date));
export function isUpcomingActivity(entry, now = new Date()) {
  const scheduled = isNewHirePresentation(entry) ||
    (entry.activity === 'Inflight Base' && entry.detail === 'Lounge Visit');
  return scheduled && centralDay(entry.startedAt) > centralDay(now);
}
