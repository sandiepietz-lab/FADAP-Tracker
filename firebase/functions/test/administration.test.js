import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canLogAdministration, administrationDuration} from '../../firebase-dist/assets/administration.js';
import {timesheetRows} from '../timesheet-summary.js';
test('only the four approved leadership accounts can log administration',()=>{
 for(const email of ['tspillersfadap@gmail.com','peggerfadap@gmail.com','arouttenfadap@gmail.com','spietzfadap@gmail.com']) assert(canLogAdministration(email));
 for(const email of ['sandiepietz@gmail.com','preview@local','klynchfadap@gmail.com',null]) assert(!canLogAdministration(email));
});
test('total time and explicit overnight ranges calculate correctly',()=>{
 assert.equal(administrationDuration({mode:'total',hours:1,minutes:25}),5100);
 assert.equal(administrationDuration({mode:'total',hours:1,minutes:60}),0);
 assert.equal(administrationDuration({mode:'range',start:'09:00',end:'10:25'}),5100);
 assert.equal(administrationDuration({mode:'range',start:'23:00',end:'01:00',overnight:true}),7200);
 assert.equal(administrationDuration({mode:'range',start:'23:00',end:'01:00'}),0);
});
test('administration is excluded from union hours, even alongside activity or coverage',()=>{
 const email='tspillersfadap@gmail.com';const allowed=new Set([email]);const now=new Date('2026-09-14T18:00:00Z');
 const admin=['admin','Tom',email,'2026-09-12','','','Administration','RSP','',90,1.5];
 assert.equal(timesheetRows([[],admin],[],allowed,now).length,1);
 const activity=[...admin];activity[0]='call';activity[6]='Client';activity[9]=30;
 const rows=timesheetRows([[],admin,activity],[],allowed,now);
 assert.equal(rows[1][2],.5);assert.equal(rows[1][4],0);assert.equal(rows[1][5],.5);
 assert(!rows[1][3].includes('Administration'));
});
test('save rules protect new and existing administration entries',()=>{
 const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
 assert.match(rules,/validAdministration\(request.resource.data\)/);
 assert.match(rules,/!administrationEntry\(resource.data\) \|\| administrationAccess\(\)/);
});
