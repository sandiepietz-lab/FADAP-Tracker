// Keep a complete, independent workbook, including its hidden daily totals.
export async function archiveTimesheets({drive, sheets, sourceId, folderId, month}) {
  if (!sourceId || !folderId) throw new Error('Timesheet archive source/folder is not configured');
  const title = `FADAP Team Hub Timesheets — ${month}`;
  const escape = value => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  const {data: existing} = await drive.files.list({
    q: `'${escape(folderId)}' in parents and name = '${escape(title)}' and trashed = false`,
    fields: 'files(id,name)', pageSize: 1,
  });
  if (existing.files?.length) return existing.files[0];
  let archiveId;
  try {
    const {data: copied} = await drive.files.copy({fileId: sourceId,
      fields: 'id,name', requestBody: {name: title, parents: [folderId]}});
    archiveId = copied.id;
    if (!archiveId) throw new Error('Google Drive did not return a timesheet archive ID');
    const {data: book} = await sheets.spreadsheets.get({spreadsheetId: archiveId,
      fields: 'sheets(properties(title,hidden))'});
    const {data: links} = await sheets.spreadsheets.values.get({spreadsheetId: archiveId,
      range: "'Timesheet Summary'!E6:E40", valueRenderOption: 'FORMULA'});
    const data = [{range: "'Timesheet Summary'!B2", values: [[month]]}];
    for (const sheet of book.sheets || []) {
      if (sheet.properties.hidden) continue;
      const name = sheet.properties.title.replaceAll("'", "''");
      data.push({range: `'${name}'!A3`, values: [[`Monthly archive · ${month} · Saved at rollover`]]});
    }
    // Copied summary links must open the archived member tabs, not the live file.
    for (const [index, row] of (links.values || []).entries()) {
      if (typeof row[0] === 'string' && row[0].includes(sourceId)) {
        data.push({range: `'Timesheet Summary'!E${index + 6}`,
          values: [[row[0].replaceAll(sourceId, archiveId)]]});
      }
    }
    await sheets.spreadsheets.values.batchUpdate({spreadsheetId: archiveId,
      requestBody: {valueInputOption: 'USER_ENTERED', data}});
    return copied;
  } catch (error) {
    if (archiveId) await drive.files.delete({fileId: archiveId}).catch(cleanupError =>
      console.error('Could not remove incomplete timesheet archive', cleanupError));
    throw error;
  }
}
