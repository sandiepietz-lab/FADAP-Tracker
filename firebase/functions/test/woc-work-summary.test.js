import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryInstant,wocWorkRows,wocWorkSummaryRequests} from '../woc-work-summary.js';
const email='demo@example.com', allowed=new Set([email]), now=new Date('2026-09-20T18:00:00Z');
const schedule=(id='woc',first='2026-09-07T17:00:00Z',last='2026-09-13T17:00:00Z')=>['',id,'Demo',email,'WOC','','',first,last,144,'completed'];
const entry=(id,date,time,minutes=30,who=email,category='Client')=>[id,'Demo',who,date,time,'',category,'Initial Contact','Call',minutes,minutes/60];
test('Central wall clock conversion accepts native Sheets numbers and DST',()=>{
 assert.equal(new Date(entryInstant('2026-09-07','12:00 PM')).toISOString(),'2026-09-07T17:00:00.000Z');
 const serial=Date.parse('2026-09-07T00:00:00Z')/86400000+25569;
 assert.equal(entryInstant(serial,.5),entryInstant('2026-09-07','12:00'));
 assert.equal(new Date(entryInstant('2026-12-07','12:00')).toISOString(),'2026-12-07T18:00:00.000Z');
 assert(Number.isNaN(entryInstant('','')));
});
test('noon boundaries and matching member determine WOC work, not coverage credit',()=>{
 const rows=wocWorkRows([[],entry('before','2026-09-07','11:00'),entry('overlap','2026-09-07','11:45'),
  entry('during','2026-09-08','13:00',60),entry('after','2026-09-13','12:00'),entry('someone','2026-09-08','13:00',60,'else@example.com')],
 [[],schedule()],allowed,now);
 assert.equal(rows.length,1);assert.equal(rows[0][4]*24,144);assert.equal(rows[0][5]*24,26.5);
 assert.equal(rows[0][6]*1440,75);assert.match(rows[0][7],/Client · Call: 2 \(01:15\)/);
});
test('duplicates, day-sync rows, and cancelled schedules cannot inflate results',()=>{
 const item=entry('one','2026-09-09','09:00');const cancelled=schedule('cancel');cancelled[10]='cancelled';
 const rows=wocWorkRows([[],item,item],[[],schedule(),schedule('duplicate'),schedule('woc:day:1'),cancelled],allowed,now);
 assert.equal(rows.length,1);assert.equal(rows[0][6]*1440,30);
});
test('cross-month work, active and upcoming status, and edits use the current source',()=>{
 const s=schedule('cross','2026-08-31T17:00:00Z','2026-09-06T17:00:00Z');
 const future=schedule('next','2026-10-01T17:00:00Z','2026-10-07T17:00:00Z');
 const rows=wocWorkRows([[],entry('aug','2026-08-31','15:00'),entry('sep','2026-09-01','15:00')],[[],s,future],allowed,new Date('2026-09-02T17:00:00Z'));
 assert.equal(rows[0][3],'Upcoming');assert.equal(rows[0][6],0);
 assert.equal(rows[1][3],'Active');assert.equal(rows[1][6]*24,1);
 assert.equal(wocWorkRows([], [[],s],allowed,now)[0][6],0);
});
test('short assignments retain fixed credit; work is capped at assignment and snapshot end',()=>{
 const s=schedule('short','2026-09-07T17:00:00Z','2026-09-08T17:00:00Z');
 const rows=wocWorkRows([[],entry('last','2026-09-08','11:30',120)], [[],s],allowed,now);
 assert.equal(rows[0][4]*24,24);assert.equal(rows[0][5]*24,26.5);assert.equal(rows[0][6]*1440,30);
 const active=wocWorkRows([[],entry('last','2026-09-08','11:30',120)], [[],s],allowed,new Date('2026-09-08T16:45:00Z'));
 assert.equal(active[0][6]*1440,15);
});
test('refresh creates a separate tab and preserves its time-format choice on later refreshes',()=>{
 const initial=wocWorkSummaryRequests([],[],'test');
 assert(initial.some(r=>r.addSheet?.properties.title==='WOC Work Summary'));
 const existing={properties:{title:'WOC Work Summary',sheetId:3,gridProperties:{rowCount:100,columnCount:8}}};
 const updates=wocWorkSummaryRequests([existing],wocWorkRows([], [[],schedule()],allowed,now),'test');
 assert(!updates.some(r=>r.addSheet||r.setDataValidation));
 assert(!updates.some(r=>r.updateCells?.start?.rowIndex===1));
 assert(updates.some(r=>r.updateCells?.range?.endRowIndex===100));
 assert(updates.every(r=>!r.updateCells || (r.updateCells.range||r.updateCells.start).sheetId===3));
});
