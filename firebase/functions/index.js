import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import { google } from "googleapis";

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const timeZone = "America/New_York";

function formatEasternDateTime(value) {
  const date = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
    month: `${parts.year}-${parts.month}`,
  };
}

export const syncEntryToGoogleSheets = onDocumentCreated(
  {
    document: "users/{userId}/entries/{entryId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    if (!event.data) return;
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");

    const entry = event.data.data();
    const started = formatEasternDateTime(entry.startedAt);
    const email = entry.email || "";
    const firstName =
      entry.firstName || email.split("@")[0] || "Team member";
    const durationMinutes = Math.ceil((Number(entry.duration) || 0) / 60);
    const durationHours = durationMinutes / 60;

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Entries!A:O",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            event.params.entryId,
            firstName,
            email,
            started.date,
            started.time,
            started.month,
            entry.activity || "",
            entry.detail || "",
            entry.comment || "",
            durationMinutes,
            durationHours,
            new Date().toISOString(),
            entry.contactMethod || "",
            entry.testPositive || "",
            Array.isArray(entry.substances) ? entry.substances.join(" + ") : "",
          ],
        ],
      },
    });
  },
);

export const deleteEntryFromGoogleSheets = onDocumentDeleted(
  {
    document: "users/{userId}/entries/{entryId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is not configured.");

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const entryId = event.params.entryId;

    const [{ data: idColumn }, { data: spreadsheet }] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Entries!A:A",
      }),
      sheets.spreadsheets.get({ spreadsheetId }),
    ]);

    const rowIndex = (idColumn.values || []).findIndex(
      (row) => row[0] === entryId,
    );
    if (rowIndex < 0) {
      console.log(`Entry ${entryId} was not found in Google Sheets.`);
      return;
    }

    const entriesSheet = spreadsheet.sheets?.find(
      (sheet) => sheet.properties?.title === "Entries",
    );
    const sheetId = entriesSheet?.properties?.sheetId;
    if (sheetId === undefined) throw new Error("Entries sheet was not found.");

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });
  },
);
