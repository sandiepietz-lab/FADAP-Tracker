const DAY = 86400000;
const serial = value => typeof value === 'number' ? Math.floor(value) : Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) / DAY + 25569;

// Calendar-day union credit, independent of the app's elapsed-shift totals.
export function timesheetRows(entries, schedules, allowedEmails, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const today = serial(`${parts.year}-${parts.month}-${parts.day}`);
  const days = new Map();
  const get = (email, date) => {
    const key = `${email}|${date}`;
    if (!days.has(key)) days.set(key, { email, date, minutes: 0, coverage: 0, labels: new Set(), counts: new Map() });
    return days.get(key);
  };
  const count = (day, label) => day.counts.set(label, (day.counts.get(label) || 0) + 1);
  const seen = new Set();
  for (const r of entries.slice(1)) {
    const email = String(r[2] || '').toLowerCase(), date = serial(r[3]);
    if (!r[0] || seen.has(r[0]) || !allowedEmails.has(email) || !Number.isFinite(date) || date > today) continue;
    seen.add(r[0]);
    const d = get(email, date);
    d.minutes += r[9] !== '' && r[9] != null ? Number(r[9]) || 0 : (Number(r[10]) || 0) * 60;
    count(d, `${r[6] || 'Activity'} ${r[8] ? String(r[8]).toLowerCase() : 'activity'}`.replace(/^fadap/i, 'FADAP'));
  }
  const seenSchedules = new Set();
  for (const r of schedules.slice(1)) {
    const email = String(r[3] || '').toLowerCase(), type = r[4];
    if (!allowedEmails.has(email) || String(r[1]).includes(':day:') || /cancel/i.test(String(r[10]))) continue;
    const first = serial(r[5]), last = serial(r[6]);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) continue;
    const key = [email, type, first, last, type === 'HotlineLogin' ? r[1] : ''].join('|');
    if (seenSchedules.has(key)) continue;
    seenSchedules.add(key);
    if (['WOC', 'Backup', 'Regional'].includes(type)) {
      if (type === 'WOC' && (last <= first || first > today || (first === today && Number(parts.hour) < 12))) continue;
      for (let date = first; date <= Math.min(last, today); date++) {
        const d = get(email, date);
        const hours = type === 'WOC' && (date === first || date === last) ? 12 : 24;
        d.coverage = Math.min(24, d.coverage + hours);
        d.labels.add(type === 'Backup' ? '24 hour backup' : type === 'WOC' ? 'WOC' : 'Regional on-call');
      }
    } else if (type === 'HotlineLogin' && Date.parse(r[8]) <= now.getTime() && first <= today) {
      const d = get(email, first);
      d.minutes += (Number(r[9]) || 0) * 60;
      count(d, 'Hotline login');
    }
  }
  return [['Member email', 'Date', 'Hours', 'Brief note'], ...Array.from(days.values())
    .sort((a, b) => a.email.localeCompare(b.email) || a.date - b.date)
    .map(d => [d.email, d.date, d.coverage || Math.round(d.minutes) / 60,
      [...d.labels, ...Array.from(d.counts, ([label, n]) => `${n} ${label}${n > 1 ? label.endsWith('activity') ? 'ies' : 's' : ''}`.replace('activityies', 'activities'))].join(', ')])];
}
