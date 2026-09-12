const cell = value => ({ userEnteredValue: typeof value === 'string' && value.startsWith('=')
  ? { formulaValue: value } : { stringValue: value } });

export const needsTimesheetLayout = sheet => sheet.properties.gridProperties.columnCount !== 5 ||
  !(sheet.developerMetadata || []).some(meta => meta.metadataKey === 'timesheet-format-selector' && meta.metadataValue === '1');

const displayTime = expr => `IF(${expr}=0,"",IF($E$2="Decimal Hours",TEXT(${expr}*24,"0.00"),TEXT(${expr},"[hh]:mm")))`;

export function summaryTimesheetFormula(email, column) {
  if (!/^[^"\s]+@[^"\s]+$/.test(email)) throw new Error('Invalid timesheet member email');
  const sum = col => `SUMIFS('Daily Totals'!${col}2:${col},'Daily Totals'!A2:A,"${email}",'Daily Totals'!B2:B,">="&DATEVALUE("1 "&$B$2),'Daily Totals'!B2:B,"<"&EDATE(DATEVALUE("1 "&$B$2),1))`;
  const hours = column === 'Total' ? `${sum('E')}+${sum('F')}` : sum(column === 'Paid' ? 'E' : 'F');
  return `=LET(duration,ROUND((${hours})*60,0)/1440,${displayTime('duration')})`;
}

export function memberTimesheetFormula(email) {
  if (!/^[^"\s]+@[^"\s]+$/.test(email)) throw new Error('Invalid timesheet member email');
  return `=LET(daily,IFNA(FILTER('Daily Totals'!B2:F,'Daily Totals'!A2:A="${email}",'Daily Totals'!B2:B>=DATEVALUE("1 "&$B$2),'Daily Totals'!B2:B<EDATE(DATEVALUE("1 "&$B$2),1)),{"No activity recorded",0,"",0,0}),paid,ARRAYFORMULA(ROUND(INDEX(daily,,4)*60,0)/1440),volunteer,ARRAYFORMULA(ROUND(INDEX(daily,,5)*60,0)/1440),total,ARRAYFORMULA(paid+volunteer),VSTACK(HSTACK(INDEX(daily,,1),ARRAYFORMULA(${displayTime('paid')}),ARRAYFORMULA(${displayTime('volunteer')}),ARRAYFORMULA(${displayTime('total')}),INDEX(daily,,3)),HSTACK("MONTHLY TOTAL",${displayTime('SUM(paid)')},${displayTime('SUM(volunteer)')},${displayTime('SUM(total)')},"")))`;
}

// Applied once to the existing report tabs on the first refresh after deployment.
// Keep tab IDs (app links), month dropdown, titles and member identities intact.
export function timesheetLayoutRequests(sheets, memberFormulas, summaryRows) {
  const requests = [];
  const members = sheets.filter(s => !s.properties.hidden && s.properties.title !== 'Timesheet Summary');
  const summary = sheets.find(s => s.properties.title === 'Timesheet Summary');
  const needs = needsTimesheetLayout;
  // Validate all identities before generating any changes.
  const identities = new Map(members.map(s => {
    const email = memberFormulas[s.properties.title]?.match(/'Daily Totals'!A2:A="([^"\s]+@[^"\s]+)"/)?.[1];
    if (!email && needs(s)) throw new Error(`Cannot identify timesheet member: ${s.properties.title}`);
    return [s.properties.title, email];
  }));
  const range = (sheetId, r1, r2, c1=0, c2=5) => ({sheetId,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
  const write = (sheetId, row, col, values) => requests.push({updateCells:{
    range:range(sheetId,row,row+1,col,col+values.length), rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
  const format = (r, style) => requests.push({repeatCell:{range:r,cell:{userEnteredFormat:style},fields:Object.keys(style).map(k=>`userEnteredFormat.${k}`).join(',')}});
  const navy={red:.094,green:.235,blue:.4},paidColor={red:.91,green:.96,blue:.92},volunteerColor={red:1,green:.97,blue:.88},totalColor={red:.86,green:.93,blue:.98};
  for (const s of [...members, summary].filter(s=>s && needs(s))) {
    const id=s.properties.sheetId,isSummary=s===summary,rows=s.properties.gridProperties.rowCount;
    if (s.properties.gridProperties.columnCount < 5) requests.push({updateSheetProperties:{properties:{sheetId:id,gridProperties:{columnCount:5}},fields:'gridProperties.columnCount'}});
    // Extend only the existing report header merges.
    for(const merge of s.merges || []) {
      if(merge.startRowIndex === 1 && merge.endRowIndex === 2 && merge.startColumnIndex >= 1) {
        requests.push({unmergeCells:{range:merge}});
        continue;
      }
      if(merge.endRowIndex<=4 && merge.endColumnIndex===s.properties.gridProperties.columnCount) {
        requests.push({unmergeCells:{range:merge}},{mergeCells:{range:{...merge,endColumnIndex:5},mergeType:'MERGE_ALL'}});
      }
    }
    requests.push({mergeCells:{range:range(id,1,2,1,3),mergeType:'MERGE_ALL'}});
    write(id,1,3,['Time Format','Hours:Minutes']);
    requests.push({setDataValidation:{range:range(id,1,2,4,5),rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'Hours:Minutes'},{userEnteredValue:'Decimal Hours'}]},strict:true,showCustomUi:true}}});
    format(range(id,1,2,3,5),{textFormat:{fontFamily:'Arial',fontSize:10,bold:true,foregroundColor:navy},backgroundColor:totalColor,verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'});
    requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:'timesheet-format-selector',metadataValue:'1',location:{sheetId:id},visibility:'DOCUMENT'}}});
    write(id,4,0,[isSummary?'Member':'Date','Paid','Volunteer','Total',isSummary?'Timesheet tab':'Brief note']);
    write(id,3,0,['Paid: WOC, Regional Coordinator, Lounge Visits, New Hire Class Presentations. 24 Hour Backup is volunteer. Coverage includes activity; future dates excluded.']);
    format(range(id,4,rows),{textFormat:{fontFamily:'Arial',fontSize:10,foregroundColor:navy},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'});
    format(range(id,4,5),{backgroundColor:totalColor,textFormat:{fontFamily:'Arial',fontSize:10,bold:true,foregroundColor:navy}});
    format(range(id,4,rows,1,2),{backgroundColor:paidColor});
    format(range(id,4,rows,2,3),{backgroundColor:volunteerColor});
    for(const col of [1,2,3]) format(range(id,5,rows,col,col+1),{horizontalAlignment:'CENTER',numberFormat:{type:'TEXT'}});
    for(const [start,end,size] of [[0,1,155],[1,2,95],[2,3,95],[3,4,95],[4,5,isSummary?180:360]]) requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:start,endIndex:end},properties:{pixelSize:size},fields:'pixelSize'}});
    for(const [start,end,size] of [[3,4,54],[4,5,34]]) requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:start,endIndex:end},properties:{pixelSize:size},fields:'pixelSize'}});
    for(const [index,rule] of (s.conditionalFormats || []).entries()) requests.push({updateConditionalFormatRule:{sheetId:id,index,rule:{...rule,ranges:rule.ranges.map(r=>r.endColumnIndex===s.properties.gridProperties.columnCount?{...r,endColumnIndex:5}:r)}}});
    if(!isSummary) {
      // A6 owns the existing spill; replacing its anchor resizes it to A:E.
      write(id,5,0,[memberTimesheetFormula(identities.get(s.properties.title))]);
      format(range(id,5,rows,4,5),{numberFormat:{type:'TEXT'},horizontalAlignment:'LEFT'});
      requests.push({autoResizeDimensions:{dimensions:{sheetId:id,dimension:'ROWS',startIndex:5,endIndex:rows}}});
    } else {
      const memberNames=new Set(members.map(s=>s.properties.title));
      summaryRows.forEach((row,index)=> {
        if(!memberNames.has(row[0])) return;
        const r=index+6;
        // Move each member's existing hyperlink with its format before replacing D.
        if (s.properties.gridProperties.columnCount !== 5) requests.push({copyPaste:{source:range(id,r-1,r,s.properties.gridProperties.columnCount===8?7:3,s.properties.gridProperties.columnCount===8?8:4),destination:range(id,r-1,r,4,5),pasteType:'PASTE_NORMAL'}});
        write(id,r-1,1,['Paid','Volunteer','Total'].map(column=>summaryTimesheetFormula(identities.get(row[0]),column)));
      });
    }
    if (s.properties.gridProperties.columnCount > 5) requests.push({deleteDimension:{range:{sheetId:id,dimension:'COLUMNS',startIndex:5,endIndex:s.properties.gridProperties.columnCount}}});
  }
  return requests;
}
