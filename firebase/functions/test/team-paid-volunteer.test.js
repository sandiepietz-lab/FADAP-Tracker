import {test} from 'node:test';
import assert from 'node:assert/strict';
import {teamPaidVolunteerRequests} from '../team-paid-volunteer.js';
const team={properties:{sheetId:1,title:'Team Summary',gridProperties:{rowCount:1000,columnCount:6}}};
const rows=[['Member email','Date','Hours','Brief note','Paid hours','Volunteer hours'],['demo@example.com',46272,24,'WOC',24,0]];
test('new section stays below existing content and follows reporting month',()=>{
 const requests=teamPaidVolunteerRequests([team],rows,[['Demo','demo@example.com']],'test');
 for(const request of requests)if(request.updateCells?.range.sheetId===1)assert(request.updateCells.range.startRowIndex>=27);
 const formulas=requests.flatMap(r=>r.updateCells?.rows||[]).flatMap(r=>r.values||[]).map(c=>c.userEnteredValue?.formulaValue).filter(Boolean);
 assert.equal(formulas.length,3);
 assert(formulas.every(f=>f.includes('$B$2')&&f.includes('$F$29')));
 assert(formulas.every(f=>!f.includes('demo@example.com')));
 assert(requests.some(r=>r.setDataValidation?.rule.condition.values[1].userEnteredValue==='Decimal Hours'));
});
test('refresh preserves format selection and member layout',()=>{
 const source={properties:{sheetId:2,title:'Paid Volunteer Daily',gridProperties:{rowCount:100,columnCount:6}}};
 const requests=teamPaidVolunteerRequests([team,source],rows,[],'test');
 assert.equal(requests.length,2);
 assert(!requests.some(r=>r.addSheet||r.setDataValidation||r.mergeCells));
 assert.equal(requests[0].updateCells.range.sheetId,2);
});
test('new section refuses to overwrite an unrelated source tab ID',()=>{
 assert.throws(()=>teamPaidVolunteerRequests([team,{properties:{sheetId:9201106,title:'Other'}}],rows,[],'test'),/already in use/);
});
