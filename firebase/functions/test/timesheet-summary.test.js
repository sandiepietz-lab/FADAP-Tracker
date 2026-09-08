import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timesheetRows } from '../timesheet-summary.js';
const email = 'demo@example.com', allowed = new Set([email]);
const now = new Date('2026-09-14T18:00:00Z');
const schedule = (id, type, first, last) => ['', id, 'Demo', email, type, first, last, `${first}T17:00:00Z`, `${last}T17:00:00Z`, 144, 'completed'];
const entry = ['entry', 'Demo', email, '2026-09-07', '', '', 'Client', '', 'Call', 20, .33];
test('WOC splits across calendar days and includes calls within coverage', () => {
  const rows = timesheetRows([[], entry], [[], schedule('woc', 'WOC', '2026-09-07', '2026-09-13')], allowed, now).slice(1);
  assert.deepEqual(rows.map(r => r[2]), [12,24,24,24,24,24,12]);
  assert.equal(rows.reduce((n,r) => n+r[2],0),144);
  assert.match(rows[0][3], /1 Client call/);
});
test('short WOC, month boundary, daily sync rows and duplicates', () => {
  const s = schedule('woc','WOC','2026-08-31','2026-09-02');
  const rows = timesheetRows([], [[],s,s,schedule('woc:day:1','WOC','2026-09-01','2026-09-01')],allowed,now).slice(1);
  assert.deepEqual(rows.map(r=>r[2]),[12,24,12]);
});
test('backup caps overlapping coverage and activity at 24 hours', () => {
  const rows = timesheetRows([[],entry], [[],schedule('woc','WOC','2026-09-07','2026-09-08'),schedule('backup','Backup','2026-09-07','2026-09-07')],allowed,now);
  assert.equal(rows[1][2],24);
});
test('uses original minutes and rebuilding removes deleted records', () => {
  assert.equal(timesheetRows([[],entry],[],allowed,now)[1][2],20/60);
  assert.equal(timesheetRows([],[],allowed,now).length,1);
});
test('excludes future and cancelled coverage and pre-noon WOC starts', () => {
  const s=schedule('woc','WOC','2026-09-07','2026-09-13');
  assert.equal(timesheetRows([], [[],s],allowed,new Date('2026-09-07T16:00:00Z')).length,1);
  const cancelled=[...s];cancelled[10]='cancelled';
  assert.equal(timesheetRows([], [[],cancelled],allowed,now).length,1);
  assert.equal(timesheetRows([], [[],s],allowed,new Date('2026-09-08T16:00:00Z')).length,3);
});
