const DAY_MS = 24 * 60 * 60 * 1000;

// Credit full elapsed 24-hour blocks. At the scheduled end, settle the
// remaining hours (including the one-hour daylight-saving difference).
export function completedOnCallHours(schedule, now = Date.now()) {
  const start = Date.parse(schedule.startDateTime);
  const end = Date.parse(schedule.endDateTime);
  const total = Math.max(0, Number(schedule.calculatedDurationHours) || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  if (now >= end) return total;
  if (schedule.type !== "WOC" || now <= start) return 0;
  return Math.min(total, Math.floor((now - start) / DAY_MS) * 24);
}

export function completedWocDays(schedule, now = Date.now()) {
  if (schedule.type !== "WOC") return [];
  const hours = completedOnCallHours(schedule, now);
  const start = Date.parse(schedule.startDateTime);
  const end = Date.parse(schedule.endDateTime);
  const days = [];
  for (let credited = 0; credited < hours; credited += 24) {
    const duration = Math.min(24, hours - credited);
    days.push({
      day: days.length + 1,
      hours: duration,
      completedAt: new Date(Math.min(end, start + (credited + duration) / 24 * DAY_MS)).toISOString(),
    });
  }
  return days;
}

// WOC covers seven calendar dates: noon on the first through 11:59 AM
// on the seventh. The final minute is rounded up to 144 credited hours.
export function normalizeWocSchedule(schedule) {
  if (schedule.type !== "WOC" || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.startDate || "")) return schedule;
  const [year, month, day] = schedule.startDate.split('-').map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day + 6)).toISOString().slice(0, 10);
  const central = (date, hour, minute) => {
    const [y, m, d] = date.split('-').map(Number);
    const target = Date.UTC(y, m - 1, d, hour, minute);
    let instant = target;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
      instant += target - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return new Date(instant).toISOString();
  };
  return { ...schedule, endDate, startDateTime: central(schedule.startDate, 12, 0),
    endDateTime: central(endDate, 11, 59), calculatedDurationHours: 144 };
}
