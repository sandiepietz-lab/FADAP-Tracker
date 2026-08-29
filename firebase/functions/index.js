import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { google } from "googleapis";

initializeApp();

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const teamSpreadsheetId = process.env.GOOGLE_SHEET_TEAM_ID;
const memberReportsSpreadsheetId =
  process.env.GOOGLE_SHEET_MEMBER_REPORTS_ID;
const memberSpreadsheetConfigs = {
  "spietzfadap@gmail.com": {
    id: process.env.GOOGLE_SHEET_SPIETZ_ID,
    envName: "GOOGLE_SHEET_SPIETZ_ID",
  },
  "tspillersfadap@gmail.com": {
    id: process.env.GOOGLE_SHEET_TSPILLERS_ID,
    envName: "GOOGLE_SHEET_TSPILLERS_ID",
  },
  "arouttenfadap@gmail.com": {
    id: process.env.GOOGLE_SHEET_AROUTTEN_ID,
    envName: "GOOGLE_SHEET_AROUTTEN_ID",
  },
  "peggerfadap@gmail.com": {
    id: process.env.GOOGLE_SHEET_PEGGER_ID,
    envName: "GOOGLE_SHEET_PEGGER_ID",
  },
  "gwrennfadap@gmail.com": {
    id: process.env.GOOGLE_SHEET_GWREN_ID,
    envName: "GOOGLE_SHEET_GWREN_ID",
  },
};
const excludedOwnerEmails = new Set([
  "sandiepietz@gmail.com",
  "sandiepietz@gmail",
]);
const timeZone = "America/Chicago";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function spreadsheetIdsForEntry(entry) {
  const email = normalizeEmail(entry?.email);
  if (!email || excludedOwnerEmails.has(email)) return [];

  const memberConfig = memberSpreadsheetConfigs[email];
  if (!memberConfig) return [];

  return requiredSpreadsheetIds([
    ["GOOGLE_SHEET_ID", spreadsheetId],
    [memberConfig.envName, memberConfig.id],
    ["GOOGLE_SHEET_TEAM_ID", teamSpreadsheetId],
    ["GOOGLE_SHEET_MEMBER_REPORTS_ID", memberReportsSpreadsheetId],
  ]);
}

function requiredSpreadsheetIds(destinations) {
  const missing = destinations
    .filter(([, id]) => !id)
    .map(([envName]) => envName);
  if (missing.length) {
    throw new Error(
      `Google Sheets destinations are not configured: ${missing.join(", ")}`,
    );
  }
  return [...new Set(destinations.map(([, id]) => id))];
}

function formatCentralDateTime(value) {
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

function entryRow(entryId, entry) {
  const started = formatCentralDateTime(entry.startedAt);
  const email = entry.email || "";
  const firstName = entry.firstName || email.split("@")[0] || "Team member";
  const durationMinutes = Math.ceil((Number(entry.duration) || 0) / 60);
  const contactMethod = entry.contactMethod ||
    (entry.activity === "Inflight Base" && entry.detail === "Lounge Visit"
      ? "In-person"
      : "");
  const treatmentPlanTypes = Array.isArray(entry.treatmentPlanTypes)
    ? entry.treatmentPlanTypes
    : [];
  const treatmentType = entry.treatmentLevel === "Inpatient" ||
      treatmentPlanTypes.includes("Inpatient")
    ? "Inpatient"
    : entry.treatmentLevel === "IOP" || treatmentPlanTypes.includes("Outpatient")
      ? "Outpatient"
      : "";
  const treatmentCenterOrProgram = entry.treatmentCenter || entry.iopProgram || "";

  return [
    entryId,
    firstName,
    email,
    started.date,
    started.time,
    started.month,
    entry.activity || "",
    entry.detail || "",
    entry.comment || "",
    durationMinutes,
    durationMinutes / 60,
    new Date().toISOString(),
    contactMethod,
    entry.testPositive || "",
    Array.isArray(entry.substances) ? entry.substances.join(" + ") : "",
    Array.isArray(entry.supportNeeds) ? entry.supportNeeds.join(" + ") : "",
    treatmentType,
    treatmentCenterOrProgram,
    entry.salesforceCase || "",
  ];
}

async function findEntryRow(sheets, targetSpreadsheetId, entryId) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: targetSpreadsheetId,
    range: "Entries!A:A",
  });
  const rowIndex = (data.values || []).findIndex((row) => row[0] === entryId);
  return rowIndex < 0 ? null : rowIndex + 1;
}

async function appendEntry(sheets, targetSpreadsheetId, row) {
  return sheets.spreadsheets.values.append({
    spreadsheetId: targetSpreadsheetId,
    range: "Entries!A:S",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function upsertEntry(sheets, targetSpreadsheetId, entryId, row) {
  const rowNumber = await findEntryRow(sheets, targetSpreadsheetId, entryId);
  if (!rowNumber) return appendEntry(sheets, targetSpreadsheetId, row);

  return sheets.spreadsheets.values.update({
    spreadsheetId: targetSpreadsheetId,
    range: `Entries!A${rowNumber}:S${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function deleteEntry(sheets, targetSpreadsheetId, entryId) {
  const rowNumber = await findEntryRow(sheets, targetSpreadsheetId, entryId);
  if (!rowNumber) return false;

  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: targetSpreadsheetId,
  });
  const entriesSheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === "Entries",
  );
  const sheetId = entriesSheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Entries sheet was not found.");

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: targetSpreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    },
  });
  return true;
}

function onCallRow(scheduleId, member, schedule) {
  const completedAtSerial =
    new Date(schedule.endDateTime).getTime() / 86400000 + 25569;
  return [
    scheduleId,
    member.displayName || member.email.split("@")[0],
    member.email,
    schedule.type || "",
    schedule.startDate || "",
    schedule.endDate || "",
    schedule.startDateTime || "",
    schedule.endDateTime || "",
    Number(schedule.calculatedDurationHours) || 0,
    schedule.status || "",
    new Date().toISOString(),
    completedAtSerial,
  ];
}

async function findOnCallRow(sheets, targetSpreadsheetId, scheduleId) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: targetSpreadsheetId,
    range: "'On Call'!A:A",
  });
  const rowIndex = (data.values || []).findIndex((row) => row[0] === scheduleId);
  return rowIndex < 0 ? null : rowIndex + 1;
}

async function upsertOnCallSchedule(
  sheets,
  targetSpreadsheetId,
  scheduleId,
  row,
) {
  const rowNumber = await findOnCallRow(
    sheets,
    targetSpreadsheetId,
    scheduleId,
  );
  if (!rowNumber) {
    return sheets.spreadsheets.values.append({
      spreadsheetId: targetSpreadsheetId,
      range: "'On Call'!A:L",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }
  return sheets.spreadsheets.values.update({
    spreadsheetId: targetSpreadsheetId,
    range: `'On Call'!A${rowNumber}:L${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

async function deleteOnCallSchedule(
  sheets,
  targetSpreadsheetId,
  scheduleId,
) {
  const rowNumber = await findOnCallRow(
    sheets,
    targetSpreadsheetId,
    scheduleId,
  );
  if (!rowNumber) return false;

  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: targetSpreadsheetId,
  });
  const onCallSheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === "On Call",
  );
  const sheetId = onCallSheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("On Call sheet was not found.");

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: targetSpreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      }],
    },
  });
  return true;
}

export const syncEntryToGoogleSheets = onDocumentCreated(
  {
    document: "users/{userId}/entries/{entryId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const userId = event.params?.userId;
    const entryId = event.params?.entryId;

    if (!event.data) {
      console.log(`syncEntryToGoogleSheets skipped: no event data for ${userId}/${entryId}`);
      return;
    }
    const entry = event.data.data();
    const email = normalizeEmail(entry?.email);
    if (!email || excludedOwnerEmails.has(email)) {
      console.log(
        `syncEntryToGoogleSheets skipped: excluded owner email userId=${userId}, entryId=${entryId}, email=${email || "<none>"}`,
      );
      return;
    }

    const row = entryRow(entryId, entry);
    const sheets = getSheetsClient();
    const targetSpreadsheetIds = spreadsheetIdsForEntry(entry);

    console.log(
      `syncEntryToGoogleSheets starting: userId=${userId}, entryId=${entryId}, spreadsheetConfigured=true, range=Entries!A:S`,
    );

    try {
      const results = await Promise.all(
        targetSpreadsheetIds.map((id) => appendEntry(sheets, id, row)),
      );

      console.log(
        `syncEntryToGoogleSheets success: userId=${userId}, entryId=${entryId}, destinations=${results.length}`,
      );
    } catch (error) {
      console.error(
        `syncEntryToGoogleSheets failed: userId=${userId}, entryId=${entryId}, spreadsheetIdConfigured=true`,
        {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw error;
    }
  },
);

export const updateEntryInGoogleSheets = onDocumentUpdated(
  {
    document: "users/{userId}/entries/{entryId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    if (!event.data) return;

    const entryId = event.params.entryId;
    const before = event.data.before.data();
    const after = event.data.after.data();
    const sheets = getSheetsClient();
    const beforeIds = spreadsheetIdsForEntry(before);
    const afterIds = spreadsheetIdsForEntry(after);
    const allIds = [...new Set([...beforeIds, ...afterIds])];
    const row = entryRow(entryId, after);

    await Promise.all(allIds.map((id) =>
      afterIds.includes(id)
        ? upsertEntry(sheets, id, entryId, row)
        : deleteEntry(sheets, id, entryId),
    ));
    console.log(
      `updateEntryInGoogleSheets success: entryId=${entryId}, destinations=${afterIds.length}`,
    );
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
    const sheets = getSheetsClient();
    const entryId = event.params.entryId;
    const entry = event.data?.data() || {};
    const targetSpreadsheetIds = spreadsheetIdsForEntry(entry);
    const results = await Promise.all(
      targetSpreadsheetIds.map((id) => deleteEntry(sheets, id, entryId)),
    );
    console.log(
      `deleteEntryFromGoogleSheets success: entryId=${entryId}, destinations=${results.filter(Boolean).length}`,
    );
  },
);

export const syncOnCallToGoogleSheets = onDocumentWritten(
  {
    document: "users/{userId}/onCallSchedules/{scheduleId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (event) => {
    const userId = event.params.userId;
    const scheduleId = event.params.scheduleId;
    const user = await getAuth().getUser(userId);
    const email = String(user.email || "").toLowerCase();
    const memberConfig = memberSpreadsheetConfigs[email];
    if (!memberConfig) {
      console.log(
        `syncOnCallToGoogleSheets skipped: non-reporting account userId=${userId}`,
      );
      return;
    }
    const targetSpreadsheetIds = requiredSpreadsheetIds([
      [memberConfig.envName, memberConfig.id],
      ["GOOGLE_SHEET_TEAM_ID", teamSpreadsheetId],
      ["GOOGLE_SHEET_MEMBER_REPORTS_ID", memberReportsSpreadsheetId],
    ]);

    const sheets = getSheetsClient();
    const after = event.data?.after;
    if (!after?.exists) {
      await Promise.all(targetSpreadsheetIds.map((id) =>
        deleteOnCallSchedule(sheets, id, scheduleId),
      ));
      console.log(
        `syncOnCallToGoogleSheets deleted: scheduleId=${scheduleId}, destinations=${targetSpreadsheetIds.length}`,
      );
      return;
    }

    const row = onCallRow(
      scheduleId,
      {
        email,
        displayName: user.displayName || "",
      },
      after.data(),
    );
    await Promise.all(targetSpreadsheetIds.map((id) =>
      upsertOnCallSchedule(sheets, id, scheduleId, row),
    ));
    console.log(
      `syncOnCallToGoogleSheets success: scheduleId=${scheduleId}, destinations=${targetSpreadsheetIds.length}`,
    );
  },
);
