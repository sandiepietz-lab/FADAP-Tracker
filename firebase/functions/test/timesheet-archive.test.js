import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveTimesheets} from '../timesheet-archive.js';

function fixture({exists=false, fail=false}={}) {
  const calls=[];
  return {calls, options:{sourceId:'live-file',folderId:'folder',month:'September 2026',
    drive:{files:{
      list:async()=>({data:{files:exists?[{id:'saved'}]:[]}}),
      copy:async request=>{calls.push(['copy',request]);return {data:{id:'archive-file'}};},
      delete:async request=>calls.push(['delete',request]),
    }},
    sheets:{spreadsheets:{
      get:async()=>({data:{sheets:[{properties:{title:'Timesheet Summary'}},
        {properties:{title:'Member'}},{properties:{title:'Daily Totals',hidden:true}}]}}),
      values:{
        get:async()=>({data:{values:[['=HYPERLINK("https://docs.google.com/spreadsheets/d/live-file/edit#gid=123","Open timesheet")']]}}),
        batchUpdate:async request=>{calls.push(['update',request]);if(fail)throw new Error('write failed');},
      },
    }},
  }};
}
test('copies whole workbook, selects archived month, and keeps links inside archive',async()=>{
  const {calls,options}=fixture();
  await archiveTimesheets(options);
  assert.equal(calls[0][1].fileId,'live-file');
  assert.deepEqual(calls[0][1].requestBody.parents,['folder']);
  const update=calls[1][1];
  assert.equal(update.spreadsheetId,'archive-file');
  const data=update.requestBody.data;
  assert.deepEqual(data[0].values,[['September 2026']]);
  assert(data.at(-1).values[0][0].includes('archive-file/edit#gid=123'));
  assert.equal(data.filter(d=>d.range.endsWith('!A3')).length,2);
  assert(!data.some(d=>d.range.includes('Daily Totals')));
});
test('retry reuses existing archive without copying or modifying it',async()=>{
  const {calls,options}=fixture({exists:true});
  assert.equal((await archiveTimesheets(options)).id,'saved');
  assert.deepEqual(calls,[]);
});
test('failure removes incomplete copy and propagates error to stop rollover',async()=>{
  const {calls,options}=fixture({fail:true});
  await assert.rejects(archiveTimesheets(options),/write failed/);
  assert.deepEqual(calls.at(-1),['delete',{fileId:'archive-file'}]);
});
