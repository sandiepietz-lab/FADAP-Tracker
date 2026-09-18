import test from 'node:test';
import assert from 'node:assert/strict';
import {isNewHirePresentation, isUpcomingActivity} from '../../firebase-dist/assets/scheduled-activities.js';
import {timesheetRows} from '../timesheet-summary.js';

const presentation = {activity:'Other Team Work',detail:'Committee Work — New Hire Class Presentation',startedAt:'2026-09-21T15:00:00Z',duration:3600};
test('presentations become countable on the Central event date, not the save date', () => {
  assert(isNewHirePresentation(presentation));
  assert(isUpcomingActivity(presentation, new Date('2026-09-21T04:59:59Z')));
  assert(!isUpcomingActivity(presentation, new Date('2026-09-21T05:00:00Z')));
  assert(!isUpcomingActivity({...presentation,detail:'Special Project'},new Date('2026-09-17T12:00:00Z')));
});
test('existing lounge scheduling and renamed Team Task activities remain supported', () => {
  assert(isNewHirePresentation({...presentation,activity:'Team Task'}));
  assert(isUpcomingActivity({...presentation,activity:'Inflight Base',detail:'Lounge Visit'},new Date('2026-09-17T12:00:00Z')));
});
test('timesheets exclude a future presentation and credit its adjustable hours on the event date', () => {
  const email='preview@local';
  const row=['event','Preview',email,'2026-09-21','','','Team Task',presentation.detail,'',90,1.5];
  const args=[[[],row],[[]],new Set([email])];
  assert.equal(timesheetRows(...args,new Date('2026-09-20T12:00:00Z')).length,1);
  const result=timesheetRows(...args,new Date('2026-09-21T12:00:00Z'));
  assert.equal(result[1][2],1.5);
  assert.equal(result[1][4],1.5);
  assert.equal(result[1][5],0);
});
