// Completed transfers update the current facility; admission counts/dates stay unchanged.
export function includeCompletedTransfers(formula) {
  return formula.replaceAll('(?i)(Awaiting Admission|In Treatment)',
    '(?i)(Awaiting Admission|In Treatment|Transfer to Another Treatment Center — Completed)');
}
export async function enableTransferReport(sheets, spreadsheetId) {
  if (!spreadsheetId) return;
  const {data:book} = await sheets.spreadsheets.get({spreadsheetId,fields:'sheets(properties),developerMetadata'});
  if (book.developerMetadata?.some(item=>item.metadataKey==='completed-transfer-center-v1')) return;
  const sheet = book.sheets.find(item=>item.properties.title==='Current Client Status');
  if (!sheet) return;
  const {data} = await sheets.spreadsheets.values.get({spreadsheetId,range:"'Current Client Status'!E10",valueRenderOption:'FORMULA'});
  const original=data.values?.[0]?.[0];
  if (typeof original!=='string'||!original.startsWith('=')||!original.includes('(?i)(Awaiting Admission|In Treatment)')) throw new Error('Unexpected current-facility formula; transfer update not applied');
  await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:[
    {updateCells:{start:{sheetId:sheet.properties.sheetId,rowIndex:9,columnIndex:4},rows:[{values:[{userEnteredValue:{formulaValue:includeCompletedTransfers(original)}}]}],fields:'userEnteredValue'}},
    {createDeveloperMetadata:{developerMetadata:{metadataKey:'completed-transfer-center-v1',metadataValue:'1',visibility:'DOCUMENT',location:{spreadsheet:true}}}},
  ]}});
}
