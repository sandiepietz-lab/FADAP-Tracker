const SOURCE = 'Paid Volunteer Daily';
const SOURCE_ID = 9201106;
const number = value => ({userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:value}});
const input = value => typeof value==='string'&&value.startsWith('=')?{userEnteredValue:{formulaValue:value}}:number(value);

export function teamPaidVolunteerRequests(sheets, dailyRows, roster, stamp) {
  const team=sheets.find(s=>s.properties.title==='Team Summary');
  if(!team) throw new Error('Team Summary tab was not found');
  const source=sheets.find(s=>s.properties.title===SOURCE);
  const sourceId=source?.properties.sheetId??SOURCE_ID;
  if(!source&&sheets.some(s=>s.properties.sheetId===sourceId))throw new Error('Paid/Volunteer source ID is already in use');
  const requests=[];
  const rowCount=Math.max(source?.properties.gridProperties.rowCount||100,dailyRows.length);
  if(!source)requests.push({addSheet:{properties:{sheetId:sourceId,title:SOURCE,hidden:true,gridProperties:{rowCount,columnCount:6}}}});
  else if(rowCount>source.properties.gridProperties.rowCount)requests.push({updateSheetProperties:{properties:{sheetId:sourceId,gridProperties:{rowCount}},fields:'gridProperties.rowCount'}});
  requests.push({updateCells:{range:{sheetId:sourceId,startRowIndex:0,endRowIndex:rowCount,startColumnIndex:0,endColumnIndex:6},rows:dailyRows.map(row=>({values:row.map(number)})),fields:'userEnteredValue'}});
  const id=team.properties.sheetId;
  const range=(r1,r2,c1=0,c2=6)=>({sheetId:id,startRowIndex:r1,endRowIndex:r2,startColumnIndex:c1,endColumnIndex:c2});
  const write=(row,col,values)=>requests.push({updateCells:{range:range(row,row+1,col,col+values.length),rows:[{values:values.map(input)}],fields:'userEnteredValue'}});
  if(!source) {
    const navy={red:.094,green:.235,blue:.4};
    const format=(r,style)=>requests.push({repeatCell:{range:r,cell:{userEnteredFormat:style},fields:Object.keys(style).map(key=>`userEnteredFormat.${key}`).join(',')}});
    const merge=r=>requests.push({mergeCells:{range:r,mergeType:'MERGE_ALL'}});
    merge(range(27,28));merge(range(28,29,0,4));merge(range(29,30));
    write(27,0,['Hours On Call With Pay & Volunteer Hours']);
    write(28,0,['Timesheet hours · Coverage includes activity']);write(28,4,['Time Format','Hours:Minutes']);
    requests.push({setDataValidation:{range:range(28,29,5,6),rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'Hours:Minutes'},{userEnteredValue:'Decimal Hours'}]},strict:true,showCustomUi:true}}});
    for(const col of [0,2,4]) {merge(range(30,31,col,col+2));merge(range(31,32,col,col+2));}
    write(30,0,['Hours On Call With Pay']);write(30,2,['Volunteer Hours']);write(30,4,['Total Hours']);
    format(range(27,32),{textFormat:{fontFamily:'Arial',fontSize:11,foregroundColor:navy},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP',backgroundColor:{red:1,green:1,blue:1}});
    format(range(27,28),{backgroundColor:{red:.396,green:.333,blue:.51},textFormat:{fontFamily:'Arial',fontSize:13,bold:true,foregroundColor:{red:1,green:1,blue:1}}});
    format(range(28,29),{backgroundColor:{red:.965,green:.949,blue:.98}});
    format(range(30,32,0,2),{backgroundColor:{red:.945,green:.922,blue:.973}});
    format(range(30,32,2,4),{backgroundColor:{red:.945,green:.922,blue:.973}});
    format(range(30,31),{textFormat:{fontFamily:'Arial',fontSize:11,bold:true,foregroundColor:navy}});
    format(range(31,32),{horizontalAlignment:'CENTER',numberFormat:{type:'TEXT'}});
    const start='EOMONTH(IF(ISNUMBER($B$2),$B$2,DATEVALUE("1 "&$B$2)),-1)+1';
    const end='EOMONTH(IF(ISNUMBER($B$2),$B$2,DATEVALUE("1 "&$B$2)),0)+1';
    const sum=(col,email)=>`SUMIFS('${SOURCE}'!${col}2:${col},'${SOURCE}'!B2:B,">="&(${start}),'${SOURCE}'!B2:B,"<"&(${end})${email?`, '${SOURCE}'!A2:A,"${email}"`:''})`;
    const formula=(kind,email)=>{
      const hours=kind==='Paid'?sum('E',email):kind==='Volunteer'?sum('F',email):`${sum('E',email)}+${sum('F',email)}`;
      return `=LET(duration,ROUND((${hours})*60,0)/1440,IF(duration=0,"",IF($F$29="Decimal Hours",TEXT(duration*24,"0.00"),TEXT(duration,"[hh]:mm"))))`;
    };
    ['Paid','Volunteer','Total'].forEach((kind,index)=>write(31,index*2,[formula(kind)]));
    format(range(30,31),{horizontalAlignment:'CENTER',backgroundColor:{red:.882,green:.843,blue:.937}});
    format(range(31,32),{backgroundColor:{red:.945,green:.922,blue:.973}});
    format(range(31,32),{textFormat:{fontFamily:'Arial',fontSize:24,bold:true,foregroundColor:navy}});
    requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:30,endIndex:32},properties:{pixelSize:48},fields:'pixelSize'}});
  }
  write(29,0,[`Updated ${stamp} CT · Automatic refresh every 15 minutes`]);
  return requests;
}
