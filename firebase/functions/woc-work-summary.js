const HOUR = 3600000;
const DAY = 24 * HOUR;
const TIME_ZONE = 'America/Chicago';
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, year:'numeric', month:'numeric', day:'numeric',
  hour:'numeric', minute:'numeric', second:'numeric', hourCycle:'h23',
});
const displayDate = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, month:'short', day:'numeric', year:'numeric',
  hour:'numeric', minute:'2-digit',
});

// Sheets dates and times are local Central wall-clock values, not UTC instants.
export function entryInstant(date, time) {
  let day;
  if (typeof date === 'number') day = new Date((Math.floor(date) - 25569) * DAY).toISOString().slice(0,10);
  else day = String(date || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  let seconds;
  if (typeof time === 'number') seconds = Math.round((time % 1) * 86400);
  else {
    const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return NaN;
    let hour=Number(match[1]);
    if (match[4]) hour=hour%12 + (match[4].toUpperCase()==='PM'?12:0);
    if (hour>23 || Number(match[2])>59 || Number(match[3]||0)>59) return NaN;
    seconds=hour*3600+Number(match[2])*60+Number(match[3]||0);
  }
  const target=Date.parse(day+'T00:00:00Z') + seconds*1000;
  let instant=target;
  for(let n=0;n<3;n++) {
    const p=Object.fromEntries(dateParts.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    instant += target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  }
  return instant;
}

export function wocWorkRows(entries, schedules, allowedEmails, now=new Date()) {
  const nowMs=Number(now);
  const seenEntries=new Set();
  const work=[];
  for(const row of entries.slice(1)) {
    const email=String(row[2]||'').trim().toLowerCase();
    if(!row[0] || seenEntries.has(row[0]) || !allowedEmails.has(email)) continue;
    seenEntries.add(row[0]);
    const start=entryInstant(row[3],row[4]);
    const minutes=row[9]!=='' && row[9]!=null ? Number(row[9]) : Number(row[10])*60;
    if(!Number.isFinite(start) || !Number.isFinite(minutes) || minutes<=0 || start>=nowMs) continue;
    work.push({email,start,end:Math.min(start+minutes*60000,nowMs),
      category:['Other Team Work','Team Tasks'].includes(row[6])?'Team Task':String(row[6]||'Other'),
      method:String(row[8]||'activity').trim() || 'activity'});
  }
  const seenSchedules=new Set();
  const assignments=[];
  for(const row of schedules.slice(1)) {
    const email=String(row[3]||'').trim().toLowerCase();
    if(row[4]!=='WOC' || !row[1] || String(row[1]).includes(':day:') || /cancel/i.test(String(row[10])) || !allowedEmails.has(email)) continue;
    const start=Date.parse(row[7]), end=Date.parse(row[8]);
    if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start) continue;
    const key=`${email}|${start}|${end}`;
    if(seenSchedules.has(key)) continue;
    seenSchedules.add(key);
    let workMs=0;
    const breakdown=new Map();
    for(const item of work) {
      if(item.email!==email) continue;
      const overlap=Math.max(0,Math.min(item.end,end)-Math.max(item.start,start));
      if(!overlap) continue;
      workMs+=overlap;
      const label=`${item.category} · ${item.method}`;
      const bucket=breakdown.get(label)||{count:0,ms:0};
      bucket.count++; bucket.ms+=overlap; breakdown.set(label,bucket);
    }
    const describe=Array.from(breakdown,([label,{count,ms}])=>{
      const minutes=Math.round(ms/60000);
      return `${label}: ${count} (${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')})`;
    }).sort().join('\n');
    assignments.push({start,email,values:[String(row[2]||email),displayDate.format(start),displayDate.format(end),
      nowMs<start?'Upcoming':nowMs<end?'Active':'Completed',
      (end-start)/DAY,26.5/24,Math.round(workMs/60000)/1440,
      describe || (nowMs<start?'Not started':'No activity logged')]});
  }
  return assignments.sort((a,b)=>b.start-a.start || a.email.localeCompare(b.email)).map(a=>a.values);
}

const TITLE='WOC Work Summary';
const SHEET_ID=9201110;
const NAVY={red:.094,green:.235,blue:.4};
const PURPLE={red:.396,green:.333,blue:.51};
const PALE={red:.945,green:.922,blue:.973};
export function wocWorkSummaryRequests(sheets, rows, stamp) {
  const existing=sheets.find(s=>s.properties.title===TITLE);
  const id=existing?.properties.sheetId??SHEET_ID;
  if(!existing && sheets.some(s=>s.properties.sheetId===id)) throw new Error('WOC summary sheet ID is already in use');
  const rowCount=Math.max(100,rows.length+5,existing?.properties.gridProperties.rowCount||0);
  const requests=[];
  const range=(a,b,c=0,d=8)=>({sheetId:id,startRowIndex:a,endRowIndex:b,startColumnIndex:c,endColumnIndex:d});
  const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}});
  const write=(row,col,values)=>requests.push({updateCells:{start:{sheetId:id,rowIndex:row,columnIndex:col},rows:[{values:values.map(cell)}],fields:'userEnteredValue'}});
  if(!existing) {
    requests.push({addSheet:{properties:{sheetId:id,title:TITLE,gridProperties:{rowCount,columnCount:8,frozenRowCount:5,hideGridlines:true}}}});
    for(const [a,b] of [[0,1],[2,3],[3,4]])requests.push({mergeCells:{range:range(a,b),mergeType:'MERGE_ALL'}});
    requests.push({mergeCells:{range:range(1,2,0,6),mergeType:'MERGE_ALL'}});
    write(0,0,['WOC Work Summary']);
    write(1,0,['All assignments · Newest first · Dates and times are Central']);write(1,6,['Time format','Hours:Minutes']);
    requests.push({setDataValidation:{range:range(1,2,7,8),rule:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'Hours:Minutes'},{userEnteredValue:'Decimal Hours'}]},strict:true,showCustomUi:true}}});
    write(3,0,['Coverage = scheduled availability · Paid credit = 26.5 hours per assignment · Logged work = recorded activity within the WOC dates and times.']);
    write(4,0,['Member','WOC Start · CT','WOC End · CT','Status','Coverage Hours','Paid Credit Hours','Logged Work Hours','Activity Breakdown · count (Hours:Minutes)']);
    const format=(r,f)=>requests.push({repeatCell:{range:r,cell:{userEnteredFormat:f},fields:'userEnteredFormat'}});
    format(range(0,rowCount),{textFormat:{fontFamily:'Arial',fontSize:11,foregroundColor:NAVY},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'});
    format(range(0,1),{backgroundColor:PURPLE,textFormat:{fontFamily:'Arial',fontSize:18,bold:true,foregroundColor:{red:1,green:1,blue:1}},verticalAlignment:'MIDDLE'});
    format(range(1,4),{backgroundColor:{red:.975,green:.961,blue:.988},textFormat:{fontFamily:'Arial',fontSize:10,foregroundColor:NAVY},verticalAlignment:'MIDDLE',wrapStrategy:'WRAP'});
    format(range(4,5),{backgroundColor:PALE,textFormat:{fontFamily:'Arial',fontSize:11,bold:true,foregroundColor:NAVY},verticalAlignment:'MIDDLE',horizontalAlignment:'CENTER',wrapStrategy:'WRAP'});
    requests.push({addBanding:{bandedRange:{range:range(5,rowCount),rowProperties:{firstBandColor:{red:1,green:1,blue:1},secondBandColor:{red:.978,green:.969,blue:.99}}}}});
    [145,165,165,100,105,105,110,380].forEach((pixelSize,index)=>requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:index,endIndex:index+1},properties:{pixelSize},fields:'pixelSize'}}));
    requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:0,endIndex:1},properties:{pixelSize:42},fields:'pixelSize'}});
    requests.push({updateDimensionProperties:{range:{sheetId:id,dimension:'ROWS',startIndex:4,endIndex:5},properties:{pixelSize:48},fields:'pixelSize'}});
  } else if(rowCount>existing.properties.gridProperties.rowCount) requests.push({updateSheetProperties:{properties:{sheetId:id,gridProperties:{rowCount}},fields:'gridProperties.rowCount'}});
  write(2,0,[`Updated ${stamp} CT · Automatic refresh every 15 minutes · Logged work does not add hours to union timesheets.`]);
  requests.push({updateCells:{range:range(5,rowCount),rows:rows.map(row=>({values:row.map((value,index)=>{
    if(index<4||index>6) return cell(value);
    return {userEnteredValue:{formulaValue:`=IF(${value}=0,"",IF($H$2="Decimal Hours",TEXT(${value}*24,"0.00"),TEXT(${value},"[hh]:mm")))`}};
  })})),fields:'userEnteredValue'}});
  if(rows.length) {
    requests.push({repeatCell:{range:range(5,rows.length+5,4,7),cell:{userEnteredFormat:{horizontalAlignment:'CENTER',textFormat:{bold:true,foregroundColor:NAVY}}},fields:'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat'}});
    requests.push({autoResizeDimensions:{dimensions:{sheetId:id,dimension:'ROWS',startIndex:5,endIndex:rows.length+5}}});
  }
  return requests;
}
