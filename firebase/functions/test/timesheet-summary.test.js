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
test('paid WOC includes calls; backup remains volunteer', () => {
  const woc = timesheetRows([[], entry], [[], schedule('w', 'WOC', '2026-09-07', '2026-09-09')], allowed, now);
  assert.deepEqual(woc.slice(1).map(r => r.slice(4)), [[12,0],[24,0],[12,0]]);
  const backup = timesheetRows([[], entry], [[], schedule('b', 'Backup', '2026-09-07', '2026-09-07')], allowed, now);
  assert.deepEqual(backup[1].slice(4), [0,24]);
});
test('paid lounge and new hire time splits from ordinary volunteer activity', () => {
  const lounge = [...entry]; lounge[0]='lounge'; lounge[6]='Inflight Base'; lounge[7]='Lounge Visit'; lounge[9]=75;
  const newHire = [...entry]; newHire[0]='newhire'; newHire[6]='Other Team Work'; newHire[7]='Committee Work — New Hire Class Presentation'; newHire[9]=60;
  const row = timesheetRows([[],entry,lounge,newHire],[],allowed,now)[1];
  assert.equal(row[4],2.25); assert.equal(row[5],20/60); assert.equal(row[2],155/60);
  assert.match(row[3], /Lounge Visit/); assert.match(row[3], /New Hire Class Presentation/);
});
test('regional uses 9 AM handoff for shorter and longer coverage', () => {
  const short = timesheetRows([], [[],schedule('r','Regional','2026-09-07','2026-09-09')],allowed,now).slice(1);
  assert.deepEqual(short.map(r=>r[4]),[15,24,9]);
  const long = timesheetRows([], [[],schedule('r','Regional','2026-08-20','2026-09-09')],allowed,now).slice(1);
  assert.equal(long.reduce((sum,r)=>sum+r[4],0),480);
  assert(long.every(r=>r[5]===0));
  assert.equal(timesheetRows([], [[],schedule('r','Regional','2026-09-07','2026-09-09')],allowed,new Date('2026-09-07T13:00:00Z')).length,1);
});
test('overlapping paid coverage and backup do not double-count hours', () => {
  const rows=timesheetRows([[],entry],[[],schedule('w','WOC','2026-09-07','2026-09-09'),schedule('r','Regional','2026-09-07','2026-09-09'),schedule('b','Backup','2026-09-07','2026-09-07')],allowed,now).slice(1);
  assert.deepEqual(rows[0].slice(4),[15,9]);
  for(const row of rows) { assert.equal(row[2],row[4]+row[5]); assert(row[2]<=24); }
});
test('paid activity on backup is split within 24 hours, and ordinary work is not paid', () => {
  const lounge=[...entry];lounge[0]='l';lounge[6]='Inflight Base';lounge[7]='Lounge Visit';lounge[9]=90;
  const row=timesheetRows([[],entry,lounge],[[],schedule('b','Backup','2026-09-07','2026-09-07')],allowed,now)[1];
  assert.deepEqual(row.slice(4),[1.5,22.5]);
  assert.deepEqual(timesheetRows([[],entry],[],allowed,now)[1].slice(4),[0,20/60]);
});
