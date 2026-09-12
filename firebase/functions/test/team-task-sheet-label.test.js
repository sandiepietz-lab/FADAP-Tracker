import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateTeamTaskLabel} from '../team-task-sheet-label.js';
import {isPaidTimesheetEntry} from '../timesheet-summary.js';
test('renames category cells and criteria together, preserving details and comments',async()=>{
 let batch;
 const sheets={spreadsheets:{get:async()=>({data:{sheets:[
  {properties:{title:'Team Summary',sheetId:1,gridProperties:{columnCount:6,rowCount:1000}}},
  {properties:{title:'Entries',sheetId:2}}]}}),values:{batchGet:async()=>({data:{valueRanges:[{values:[
  ['Other Team Work','=COUNTIF(G:G,"Other Team Work")','A note about Other Team Work','Special Project']]}]}})},
 batchUpdate:async r=>{batch=r;}}};
 await migrateTeamTaskLabel(sheets,'test');
 const changes=batch.requestBody.requests;
 assert.equal(changes.length,4);
 assert.equal(changes[0].updateCells.rows[0].values[0].userEnteredValue.stringValue,'Team Task');
 assert.equal(changes[1].updateCells.rows[0].values[0].userEnteredValue.formulaValue,'=COUNTIF(G:G,"Team Task")');
 assert.equal(changes[2].findReplace.range.startColumnIndex,6);
 assert.equal(changes[2].findReplace.range.endColumnIndex,7);
 assert(changes[3].createDeveloperMetadata);
});
test('new Team Task label preserves paid new-hire classification',()=>{
 const row=[];row[6]='Team Task';row[7]='Committee Work — New Hire Class Presentation';
 assert.equal(isPaidTimesheetEntry(row),true);
 row[7]='Special Project';assert.equal(isPaidTimesheetEntry(row),false);
});
test('completed migration is not repeated',async()=>{
 await migrateTeamTaskLabel({spreadsheets:{get:async()=>({data:{developerMetadata:[{metadataKey:'team-task-label-v1'}]}})}},'test');
});
