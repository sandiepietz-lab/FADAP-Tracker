import {test} from 'node:test';
import assert from 'node:assert/strict';
import {timesheetLayoutRequests,memberTimesheetFormula} from '../timesheet-layout.js';
const sheet=(title,id,columns=8)=>({properties:{title,sheetId:id,gridProperties:{columnCount:columns,rowCount:40}},merges:[{sheetId:id,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:8}]});
const sheets=[sheet('Demo',1),sheet('Timesheet Summary',2)];
const formulas={Demo:memberTimesheetFormula('demo@example.com')};
test('migration preserves tab IDs, month selector and link destinations',()=>{
 const requests=timesheetLayoutRequests(sheets,formulas,[['Demo',0,0,'=HYPERLINK("example","Open")']]);
 assert(!requests.some(r=>r.deleteSheet||r.addSheet));
 assert(!requests.some(r=>r.updateCells?.range.startRowIndex===1 && r.updateCells.range.startColumnIndex<3));
 const copy=requests.find(r=>r.copyPaste)?.copyPaste;
 assert.equal(copy.source.startColumnIndex,7);assert.equal(copy.destination.startColumnIndex,4);
 const cells=requests.filter(r=>r.updateCells).map(r=>r.updateCells);
 assert(cells.some(c=>c.range.sheetId===2&&c.rows[0].values.some(v=>v.userEnteredValue?.formulaValue?.includes("'Daily Totals'!F2:F"))));
 for(const c of cells){assert.equal(c.range.endRowIndex-c.range.startRowIndex,c.rows.length);assert.equal(c.range.endColumnIndex-c.range.startColumnIndex,c.rows[0].values.length);}
});
test('already migrated layouts remain untouched',()=>{
 assert.deepEqual(timesheetLayoutRequests([sheet('Demo',1,5),sheet('Timesheet Summary',2,5)].map(s=>({...s,developerMetadata:[{metadataKey:'timesheet-format-selector',metadataValue:'1'}]})),formulas,[]),[]);
});
test('missing member identity fails before mutation',()=>{
 assert.throws(()=>timesheetLayoutRequests(sheets,{},[]),/Cannot identify/);
});
