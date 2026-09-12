// Rename report labels and their formula criteria together; leave notes/details alone.
export async function migrateTeamTaskLabel(sheets, spreadsheetId) {
  const {data: book} = await sheets.spreadsheets.get({spreadsheetId,
    fields: 'developerMetadata,sheets(properties)'});
  if (book.developerMetadata?.some(m => m.metadataKey === 'team-task-label-v1')) return;
  const tabs = book.sheets.filter(s => !['Entries', 'Raw Entries', 'On Call',
    'Paid Volunteer Daily', 'Daily Totals'].includes(s.properties.title));
  const ranges = tabs.map(({properties:p}) =>
    `'${p.title.replaceAll("'", "''")}'!A1:${columnName(p.gridProperties.columnCount)}${Math.min(100, p.gridProperties.rowCount)}`);
  const {data: values} = await sheets.spreadsheets.values.batchGet({spreadsheetId,
    ranges, valueRenderOption: 'FORMULA'});
  const requests = [];
  values.valueRanges.forEach((range, index) => {
    (range.values || []).forEach((row, r) => row.forEach((value, c) => {
      if (typeof value !== 'string') return;
      const formula = value.startsWith('=');
      if (!(formula ? value.includes('Other Team Work') : value === 'Other Team Work')) return;
      requests.push({updateCells:{start:{sheetId:tabs[index].properties.sheetId,
        rowIndex:r,columnIndex:c},rows:[{values:[{userEnteredValue:
          {[formula ? 'formulaValue' : 'stringValue']:value.replaceAll('Other Team Work','Team Task')}}]}],
        fields:'userEnteredValue'}});
    }));
  });
  const entries = book.sheets.find(s => s.properties.title === 'Entries');
  if (!entries) throw new Error('Team Task migration requires Entries');
  requests.push({findReplace:{find:'Other Team Work',replacement:'Team Task',
    matchCase:true,matchEntireCell:true,includeFormulas:false,
    range:{sheetId:entries.properties.sheetId,startRowIndex:1,startColumnIndex:6,endColumnIndex:7}}});
  requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:'team-task-label-v1',
    metadataValue:'1',visibility:'DOCUMENT',location:{spreadsheet:true}}}});
  await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests}});
}
function columnName(number) {
  let name='';
  while(number){number--;name=String.fromCharCode(65+number%26)+name;number=Math.floor(number/26);}
  return name;
}
