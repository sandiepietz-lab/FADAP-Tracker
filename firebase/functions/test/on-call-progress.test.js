import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { completedOnCallHours, completedWocDays, normalizeWocSchedule } from '../on-call-progress.js';

const DAY = 86400000;
const start = Date.parse('2026-08-31T17:00:00Z');
const schedule = { type: 'WOC', startDateTime: new Date(start).toISOString(),
  endDateTime: new Date(start + 6 * DAY - 60000).toISOString(),
  startDate: '2026-08-31', endDate: '2026-09-06', calculatedDurationHours: 144 };

test('credits only full days, starts at zero and caps at 144', () => {
  for (let day = 0; day < 6; day++) {
    assert.equal(completedOnCallHours(schedule, start + day * DAY), day * 24);
    if (day) assert.equal(completedOnCallHours(schedule, start + day * DAY - 1), (day - 1) * 24);
  }
  assert.equal(completedOnCallHours(schedule, start - DAY), 0);
  assert.equal(completedOnCallHours(schedule, start + 30 * DAY), 144);
});

test('preserves Backup, Regional and Hotline completion behavior', () => {
  for (const type of ['Backup', 'Regional', 'HotlineLogin']) {
    const value = { ...schedule, type, calculatedDurationHours: 12.5 };
    assert.equal(completedOnCallHours(value, start + DAY), 0);
    assert.equal(completedOnCallHours(value, start + 6 * DAY), 12.5);
  }
  assert.equal(completedOnCallHours({ ...schedule, startDateTime: 'invalid' }), 0);
});

test('settles DST-shortened week without crediting beyond the scheduled end', () => {
  const spring = { ...schedule, endDateTime: new Date(start + 6 * DAY - 3600000).toISOString() };
  const days = completedWocDays(spring, Date.parse(spring.endDateTime));
  assert.equal(days.reduce((sum, day) => sum + day.hours, 0), 144);
  assert.equal(days.at(-1).completedAt, spring.endDateTime);
  const fall = { ...schedule, endDateTime: new Date(start + 6 * DAY + 3600000).toISOString() };
  assert.equal(completedOnCallHours(fall, start + 6 * DAY), 144);
  assert.equal(completedOnCallHours(fall, start + 8 * DAY), 144);
});

// Evaluate the real function module with inert Firebase registration. All Sheets
// operations below use an in-memory client; tests never contact live services.
const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '').replace(/export const /g, 'const ');
const context = { initializeApp() {}, onDocumentCreated() {}, onDocumentDeleted() {},
  onDocumentUpdated() {}, onDocumentWritten() {}, onSchedule: (options, handler) => handler, process: { env: {} },
  completedOnCallHours, completedWocDays, normalizeWocSchedule, console };
vm.createContext(context);
vm.runInContext(source + "\nglobalThis.refreshDailyWocHours = refreshDailyWocHours;", context);
const member = { email: 'demo@example.com', displayName: 'Demo' };
const rowsAt = (days, value = schedule) => context.onCallReportingRows('demo', 'shift', member, value, start + days * DAY);
const completedTotal = (rows) => rows.filter(row => row[10] === 'completed').reduce((sum, row) => sum + row[9], 0);

test('Sheets completed filters count daily rows once, including at week end', () => {
  assert.equal(completedTotal(rowsAt(0)), 0);
  assert.equal(completedTotal(rowsAt(1)), 24);
  assert.equal(completedTotal(rowsAt(2)), 48);
  assert.equal(completedTotal(rowsAt(7)), 144);
  assert.equal(rowsAt(1)[0][10], 'active');
  assert.equal(rowsAt(7)[0][9], 0);
  assert.equal(rowsAt(1)[1][5], '2026-09-01');
  assert.equal(rowsAt(1)[1][12], Date.UTC(2026, 8, 1) / DAY + 25569);
});

test('atomic Sheets reconciliation is repeatable and cleans up edits and deletion', async () => {
  let cells = [['User ID', 'Schedule ID']];
  const decode = (cell) => cell.userEnteredValue?.numberValue ?? cell.userEnteredValue?.stringValue ?? '';
  const sheets = { spreadsheets: {
    values: { get: async () => ({ data: { values: cells } }) },
    get: async () => ({ data: { sheets: [{ properties: { title: 'On Call', sheetId: 1 } }] } }),
    batchUpdate: async ({ requestBody }) => {
      for (const request of requestBody.requests) {
        if (request.updateCells) cells[request.updateCells.range.startRowIndex] = request.updateCells.rows[0].values.map(decode);
        if (request.appendCells) cells.push(...request.appendCells.rows.map(row => row.values.map(decode)));
      }
    },
  } };
  const sync = rows => context.reconcileOnCallRows(sheets, 'fake-sheet', 'shift', rows);
  await sync(rowsAt(1));
  await sync(rowsAt(1));
  assert.equal(cells.filter(row => row[1] === 'shift:day:1').length, 1);
  await sync(rowsAt(7));
  assert.equal(completedTotal(cells), 144);
  await sync(rowsAt(2));
  assert.equal(completedTotal(cells), 48);
  await sync(rowsAt(7, { ...schedule, type: 'Backup', calculatedDurationHours: 24, status: 'completed' }));
  assert.equal(completedTotal(cells), 24);
  await sync([]);
  assert.equal(cells.filter(row => String(row[1] || '').startsWith('shift')).length, 0);
});

test('app and server use identical hour calculations', () => {
  assert.equal(readFileSync(new URL('../on-call-progress.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../../firebase-dist/assets/on-call-progress.js', import.meta.url), 'utf8'));
});


test('background refresh credits WOC without an open app and skips unchanged hours', async () => {
  const now = Date.now();
  let value = { ...schedule, startDate: undefined, status: 'active',
    startDateTime: new Date(now - DAY - 1000).toISOString(),
    endDateTime: new Date(now + 6 * DAY).toISOString() };
  let writes = 0;
  const doc = { exists: true, ref: {}, data: () => value };
  context.FieldPath = { documentId: () => '__name__' };
  context.getFirestore = () => ({
    collectionGroup: () => {
      let after = false;
      const query = { orderBy: () => query, limit: () => query,
        startAfter: () => { after = true; return query; },
        get: async () => ({ empty: after, docs: after ? [] : [doc] }) };
      return query;
    },
    runTransaction: async callback => callback({ get: async () => doc,
      update: (ref, patch) => { writes++; value = { ...value, ...patch }; } }),
  });
  await context.refreshDailyWocHours();
  assert.equal(value.completedHours, 24);
  assert.equal(value.status, 'active');
  await context.refreshDailyWocHours();
  assert.equal(writes, 1);
});


test('default WOC runs noon to noon for six days', () => {
  const corrected = normalizeWocSchedule({ type: 'WOC', startDate: '2026-08-31', calculatedDurationHours: 168 });
  assert.equal(corrected.startDateTime, '2026-08-31T17:00:00.000Z');
  assert.equal(corrected.endDateTime, '2026-09-06T17:00:00.000Z');
  assert.equal(corrected.endDate, '2026-09-06');
  assert.equal(corrected.calculatedDurationHours, 144);
  const end = Date.parse(corrected.endDateTime);
  assert.equal(completedOnCallHours(corrected, end - 1), 120);
  assert.equal(completedOnCallHours(corrected, end), 144);
  const days = completedWocDays(corrected, end);
  assert.equal(days.length, 6);
  assert.equal(days.at(-1).completedAt, corrected.endDateTime);
  assert.equal(days.reduce((sum, day) => sum + day.hours, 0), 144);
  const winter = normalizeWocSchedule({ type: 'WOC', startDate: '2026-01-05' });
  assert.equal(winter.startDateTime, '2026-01-05T18:00:00.000Z');
  assert.equal(winter.endDateTime, '2026-01-11T18:00:00.000Z');
});


test('custom WOC dates survive normalization and credit only their duration in Sheets', () => {
  const shorter = normalizeWocSchedule({ ...schedule, endDate: '2026-09-02' });
  assert.equal(shorter.endDate, '2026-09-02');
  assert.equal(shorter.endDateTime, '2026-09-02T17:00:00.000Z');
  assert.equal(shorter.calculatedDurationHours, 48);
  assert.deepEqual(normalizeWocSchedule(shorter), shorter);
  assert.equal(completedOnCallHours(shorter, start + DAY), 24);
  assert.equal(completedOnCallHours(shorter, start + 10 * DAY), 48);
  assert.equal(completedTotal(rowsAt(7, shorter)), 48);
  assert.equal(rowsAt(7, shorter).length, 3);
  const moved = normalizeWocSchedule({ ...shorter, startDate: '2026-09-01' });
  assert.equal(moved.calculatedDurationHours, 24);
});

test('noon Central date ranges account for daylight saving transitions', () => {
  const spring = normalizeWocSchedule({ type: 'WOC', startDate: '2026-03-07', endDate: '2026-03-09' });
  const fall = normalizeWocSchedule({ type: 'WOC', startDate: '2026-10-31', endDate: '2026-11-02' });
  assert.equal(spring.calculatedDurationHours, 47);
  assert.equal(fall.calculatedDurationHours, 49);
  for (const value of [spring, fall]) {
    const days = completedWocDays(value, Date.parse(value.endDateTime));
    assert.equal(days.reduce((sum, day) => sum + day.hours, 0), value.calculatedDurationHours);
    assert.equal(days.at(-1).completedAt, value.endDateTime);
  }
});
