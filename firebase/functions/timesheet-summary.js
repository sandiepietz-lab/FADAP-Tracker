const DAY = 86400000;
const serial = value => typeof value === 'number' ? Math.floor(value) : Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`) / DAY + 25569;

// Classification affects timesheets only; stored app activities are unchanged.
export function isPaidTimesheetEntry(row) {
  const activity = String(row[6] || '').trim();
  const detail = String(row[7] || '').trim();
  return (activity === 'Inflight Base' && /^Lounge Visit(?:$| —)/i.test(detail)) ||
    (['Other Team Work', 'Team Tasks'].includes(activity) &&
      /^(?:Committee Work — )?New Hire Class Presentation(?:$| —)/i.test(detail));
}

function coveredHours(intervals) {
  let total = 0, end = 0;
  for (const [first, last] of [...intervals].sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, last - Math.max(first, end));
    end = Math.max(end, last);
  }
  return total;
}

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
    if (!days.has(key)) days.set(key, { email, date, minutes: 0, paidMinutes: 0, coverage: [], paidCoverage: [], labels: new Set(), counts: new Map() });
    return days.get(key);
  };
  const count = (day, label) => day.counts.set(label, (day.counts.get(label) || 0) + 1);
  const seen = new Set();
  for (const r of entries.slice(1)) {
    const email = String(r[2] || '').toLowerCase(), date = serial(r[3]);
    if (!r[0] || seen.has(r[0]) || !allowedEmails.has(email) || !Number.isFinite(date) || date > today) continue;
    seen.add(r[0]);
    const d = get(email, date);
    const minutes = Math.max(0, r[9] !== '' && r[9] != null ? Number(r[9]) || 0 : (Number(r[10]) || 0) * 60);
    d.minutes += minutes;
    const paid = isPaidTimesheetEntry(r);
    if (paid) d.paidMinutes += minutes;
    count(d, `${paid ? String(r[7]).replace(/^Committee Work — /, '') : r[6] || 'Activity'} ${r[8] ? String(r[8]).toLowerCase() : 'activity'}`.replace(/^fadap/i, 'FADAP'));
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
      const startHour = type === 'WOC' ? 12 : type === 'Regional' ? 9 : 0;
      if (type !== 'Backup' && (last <= first || first > today || (first === today && Number(parts.hour) < startHour))) continue;
      for (let date = first; date <= Math.min(last, today); date++) {
        const d = get(email, date);
        const interval = type === 'Backup' ? [0, 24] :
          [date === first ? startHour : 0, date === last ? startHour : 24];
        d.coverage.push(interval);
        if (type !== 'Backup') d.paidCoverage.push(interval);
        d.labels.add(type === 'Backup' ? '24 hour backup' : type === 'WOC' ? 'WOC' : 'Regional Coordinator');
      }
    } else if (type === 'HotlineLogin' && Date.parse(r[8]) <= now.getTime() && first <= today) {
      const d = get(email, first);
      d.minutes += (Number(r[9]) || 0) * 60;
      count(d, 'Hotline login');
    }
  }
  return [['Member email', 'Date', 'Hours', 'Brief note', 'Paid hours', 'Volunteer hours'], ...Array.from(days.values())
    .sort((a, b) => a.email.localeCompare(b.email) || a.date - b.date)
    .map(d => {
      const coverage = coveredHours(d.coverage);
      const paidCoverage = coveredHours(d.paidCoverage);
      const minutes = coverage ? Math.round(coverage * 60) : Math.round(d.minutes);
      // Coverage includes other logged activity; paid coverage takes precedence
      // over overlapping backup so no hour is counted twice.
      const paidMinutes = Math.min(minutes, paidCoverage ? Math.round(paidCoverage * 60) : Math.round(d.paidMinutes));
      return [d.email, d.date, minutes / 60,
        [...d.labels, ...Array.from(d.counts, ([label, n]) => `${n} ${label}${n > 1 ? label.endsWith('activity') ? 'ies' : 's' : ''}`.replace('activityies', 'activities'))].join(', '),
        paidMinutes / 60, (minutes - paidMinutes) / 60];
    })];
}
