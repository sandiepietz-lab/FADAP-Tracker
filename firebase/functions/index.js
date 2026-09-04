import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { google } from "googleapis";

initializeApp();

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const teamSpreadsheetId = process.env.GOOGLE_SHEET_TEAM_ID;
const memberReportsSpreadsheetId =
  process.env.GOOGLE_SHEET_MEMBER_REPORTS_ID;
const monthlyReportsFolderId = process.env.GOOGLE_MONTHLY_REPORTS_FOLDER_ID;
const salesforceCaseTrackerSpreadsheetId =
  process.env.GOOGLE_SHEET_SALESFORCE_CASE_TRACKER_ID;
const teamReportSheetIds = [210000003, 210000005, 210000002, 210000004];
const teamReportSheetNames = new Set([
  "Team Summary",
  "Test Positive Stats",
  "Member Summary",
  "Interaction Stats",
]);
const supportingSheetNames = new Set([
  "On Call",
  "Summary",
  "Entries",
  "Raw Entries",
  "Month Options",
]);
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
  "bdumasfadap@gmail.com": {},
  "bbedillionfadap@gmail.com": {},
  "culrichfadap@gmail.com": {},
  "dmartinezfadap@gmail.com": {},
  "dkrupskifadap@gmail.com": {},
  "darnettfadap@gmail.com": {},
  "ealexanderfadap@gmail.com": {},
  "ewatermanfadap@gmail.com": {},
  "gsteinkefadap@gmail.com": {},
  "jhollingsworthfadap@gmail.com": {},
  "jwallerfadap@gmail.com": {},
  "jnevantfadap@gmail.com": {},
  "klynchfadap@gmail.com": {},
  "kbullfadap@gmail.com": {},
  "llightfadap@gmail.com": {},
  "mstidomfadap@gmail.com": {},
  "nbergrenfadap@gmail.com": {},
  "nrossfadap@gmail.com": {},
  "pspencefadap@gmail.com": {},
  "pbullardfadap@gmail.com": {},
  "rtumlinsonfadap@gmail.com": {},
  "sflowersfadap@gmail.com": {},
  "sgrumfadap@gmail.com": {},
  "shartmanfadap@gmail.com": {},
  "tdawsonfadap@gmail.com": {},
  "wforsythfadap@gmail.com": {},
};
const excludedOwnerEmails = new Set([
  "sandiepietz@gmail.com",
  "sandiepietz@gmail",
]);
const timeZone = "America/Chicago";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSalesforceCase(value) {
  return String(value || "").trim().toUpperCase();
}

function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function getGoogleWorkspaceClients() {
  const auth = new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
  return {
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
}

function reportingMonth(now = new Date(), monthOffset = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const month = new Date(Date.UTC(parts.year, parts.month - 1 + monthOffset, 1));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(month);
}

function previousReportingMonth(now = new Date()) {
  return reportingMonth(now, -1);
}

function escapeDriveQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function createMonthlyReportArchive(reportingMonth) {
  requiredSpreadsheetIds([
    ["GOOGLE_SHEET_TEAM_ID", teamSpreadsheetId],
    ["GOOGLE_SHEET_MEMBER_REPORTS_ID", memberReportsSpreadsheetId],
    ["GOOGLE_MONTHLY_REPORTS_FOLDER_ID", monthlyReportsFolderId],
  ]);

  const title = `FADAP Daily Monthly Report — ${reportingMonth}`;
  const { drive, sheets } = getGoogleWorkspaceClients();
  const existing = await drive.files.list({
    q: `'${escapeDriveQuery(monthlyReportsFolderId)}' in parents and name = '${escapeDriveQuery(title)}' and trashed = false`,
    fields: "files(id,name,webViewLink)",
    pageSize: 1,
  });
  if (existing.data.files?.length) {
    console.log(`Monthly report archive already exists: ${title}`);
    return existing.data.files[0];
  }

  let archiveId;
  try {
    const copied = await drive.files.copy({
      fileId: memberReportsSpreadsheetId,
      fields: "id,name,webViewLink",
      requestBody: { name: title, parents: [monthlyReportsFolderId] },
    });
    archiveId = copied.data.id;
    if (!archiveId) throw new Error("Google Drive did not return an archive ID.");

    const copiedTeamSheets = [];
    for (const sheetId of teamReportSheetIds) {
      const copiedSheet = await sheets.spreadsheets.sheets.copyTo({
        spreadsheetId: teamSpreadsheetId,
        sheetId,
        requestBody: { destinationSpreadsheetId: archiveId },
      });
      copiedTeamSheets.push(copiedSheet.data);
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: archiveId,
      requestBody: {
        requests: copiedTeamSheets.map((sheet, index) => ({
          updateSheetProperties: {
            properties: {
              sheetId: sheet.sheetId,
              title: [...teamReportSheetNames][index],
              index,
            },
            fields: "title,index",
          },
        })),
      },
    });

    const { data: archive } = await sheets.spreadsheets.get({
      spreadsheetId: archiveId,
      fields: "sheets(properties(sheetId,title,hidden,index))",
    });
    const memberRanges = [];
    const teamRanges = [];
    for (const sheet of archive.sheets || []) {
      const sheetTitle = sheet.properties?.title;
      if (!sheetTitle) continue;
      if (teamReportSheetNames.has(sheetTitle)) {
        teamRanges.push(`'${sheetTitle}'!B2`);
      } else if (!supportingSheetNames.has(sheetTitle)) {
        memberRanges.push(`'${sheetTitle.replaceAll("'", "''")}'!A3`);
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: archiveId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [...memberRanges, ...teamRanges].map((range) => ({
          range,
          values: [[reportingMonth]],
        })),
      },
    });

    console.log(`Monthly report archive created: ${title}, id=${archiveId}`);
    return copied.data;
  } catch (error) {
    if (archiveId) {
      await drive.files.delete({ fileId: archiveId }).catch((cleanupError) => {
        console.error("Could not remove incomplete monthly archive", cleanupError);
      });
    }
    throw error;
  }
}

async function setCurrentReportingMonth(currentMonth) {
  const sheets = getSheetsClient();
  const { data: memberReports } = await sheets.spreadsheets.get({
    spreadsheetId: memberReportsSpreadsheetId,
    fields: "sheets(properties(title))",
  });
  const memberRanges = (memberReports.sheets || [])
    .map((sheet) => sheet.properties?.title)
    .filter((title) => title && !supportingSheetNames.has(title))
    .map((title) => `'${title.replaceAll("'", "''")}'!A3`);
  const teamRanges = [...teamReportSheetNames]
    .map((title) => `'${title}'!B2`);

  await Promise.all([
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: memberReportsSpreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: memberRanges.map((range) => ({
          range,
          values: [[currentMonth]],
        })),
      },
    }),
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: teamSpreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: teamRanges.map((range) => ({
          range,
          values: [[currentMonth]],
        })),
      },
    }),
  ]);
  console.log(`Current report tabs advanced to ${currentMonth}`);
}

function spreadsheetIdsForEntry(entry) {
  const email = normalizeEmail(entry?.email);
  if (!email || excludedOwnerEmails.has(email)) return [];

  const memberConfig = memberSpreadsheetConfigs[email];
  if (!memberConfig) return [];

  const destinations = [
    ["GOOGLE_SHEET_ID", spreadsheetId],
    ["GOOGLE_SHEET_TEAM_ID", teamSpreadsheetId],
    ["GOOGLE_SHEET_MEMBER_REPORTS_ID", memberReportsSpreadsheetId],
  ];
  if (memberConfig.envName) {
    destinations.splice(1, 0, [memberConfig.envName, memberConfig.id]);
  }
  return requiredSpreadsheetIds(destinations);
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
    entryNotes(entry),
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

function salesforceCaseRow(entryId, entry) {
  const caseNumber = String(entry.salesforceCase || "").trim();
  const caseKey = normalizeSalesforceCase(caseNumber);
  if (!caseKey) return null;

  const started = formatCentralDateTime(entry.startedAt);
  const [year, month, day] = started.date.split("-").map(Number);
  const timeMatch = started.time.match(/^(\d+):(\d+)\s+(AM|PM)$/);
  const rawHour = Number(timeMatch?.[1] || 0);
  const minute = Number(timeMatch?.[2] || 0);
  const dayPeriod = timeMatch?.[3] || "AM";
  const hour = rawHour % 12 + (dayPeriod === "PM" ? 12 : 0);
  const dateSerial = Date.UTC(year, month - 1, day) / 86400000 + 25569;
  const timeSerial = (hour * 60 + minute) / 1440;
  const email = entry.email || "";
  const firstName = entry.firstName || email.split("@")[0] || "Team member";
  const durationMinutes = Math.ceil((Number(entry.duration) || 0) / 60);
  const contactMethod = entry.contactMethod ||
    (entry.activity === "Inflight Base" && entry.detail === "Lounge Visit"
      ? "In-person"
      : "");

  return [
    caseNumber,
    caseKey,
    dateSerial,
    timeSerial,
    firstName,
    email,
    entry.activity || "",
    entry.detail || "",
    contactMethod,
    entryNotes(entry),
    durationMinutes,
    durationMinutes / 1440,
    entryId,
    new Date().toISOString(),
  ];
}

function entryNotes(entry) {
  const hotlineLogin = entry.hotlineLoginDate && entry.hotlineLoginTime
    ? `Hotline login: ${entry.hotlineLoginDate} ${entry.hotlineLoginTime}` +
      `${entry.hotlineLoginEndTime ? `–${entry.hotlineLoginEndTime}` : ""} CT`
    : "";
  const dischargeDate = entry.dischargeDate
    ? `Discharge date: ${entry.dischargeDate}`
    : "";
  return [hotlineLogin, entry.comment || "", dischargeDate]
    .filter(Boolean)
    .join(" — ");
}

function requireSalesforceCaseTrackerId() {
  if (!salesforceCaseTrackerSpreadsheetId) {
    throw new Error(
      "Google Sheets destination is not configured: " +
      "GOOGLE_SHEET_SALESFORCE_CASE_TRACKER_ID",
    );
  }
  return salesforceCaseTrackerSpreadsheetId;
}

async function findSalesforceCaseEntryRow(sheets, entryId) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: requireSalesforceCaseTrackerId(),
    range: "'Case Activity'!M:M",
  });
  const rowIndex = (data.values || []).findIndex((row) => row[0] === entryId);
  return rowIndex < 0 ? null : rowIndex + 1;
}

async function upsertSalesforceCaseEntry(sheets, entryId, entry) {
  const row = salesforceCaseRow(entryId, entry);
  if (!row) return deleteSalesforceCaseEntry(sheets, entryId);

  const spreadsheetId = requireSalesforceCaseTrackerId();
  const rowNumber = await findSalesforceCaseEntryRow(sheets, entryId);
  if (!rowNumber) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Case Activity'!A:N",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
    return true;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Case Activity'!A${rowNumber}:N${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
  return true;
}

async function deleteSalesforceCaseEntry(sheets, entryId) {
  const spreadsheetId = requireSalesforceCaseTrackerId();
  const rowNumber = await findSalesforceCaseEntryRow(sheets, entryId);
  if (!rowNumber) return false;

  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const caseActivitySheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === "Case Activity",
  );
  const sheetId = caseActivitySheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Case Activity sheet was not found.");

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
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

async function findEntryRow(sheets, targetSpreadsheetId, entryId) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: targetSpreadsheetId,
    range: "Entries!A:A",
  });
  const rowIndex = (data.values || []).findIndex((row) => row[0] === entryId);
  return rowIndex < 0 ? null : rowIndex + 1;
}

const entriesSheetIdCache = new Map();

async function getEntriesSheetId(sheets, targetSpreadsheetId) {
  const cached = entriesSheetIdCache.get(targetSpreadsheetId);
  if (cached !== undefined) return cached;

  const { data: spreadsheet } = await sheets.spreadsheets.get({
    spreadsheetId: targetSpreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const entriesSheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === "Entries",
  );
  const sheetId = entriesSheet?.properties?.sheetId;
  if (sheetId === undefined) throw new Error("Entries sheet was not found.");
  entriesSheetIdCache.set(targetSpreadsheetId, sheetId);
  return sheetId;
}

function entryCellData(value, columnIndex) {
  if (columnIndex === 3 || columnIndex === 5) {
    const [year, month, day = 1] = String(value).split("-").map(Number);
    return {
      userEnteredValue: {
        numberValue: Date.UTC(year, month - 1, day) / 86400000 + 25569,
      },
      userEnteredFormat: {
        numberFormat: {
          type: "DATE",
          pattern: columnIndex === 3 ? "yyyy-mm-dd" : "yyyy-mm",
        },
      },
    };
  }
  if (columnIndex === 4) {
    const match = String(value).match(/^(\d+):(\d+)\s+(AM|PM)$/);
    const rawHour = Number(match?.[1] || 0);
    const minute = Number(match?.[2] || 0);
    const hour = rawHour % 12 + (match?.[3] === "PM" ? 12 : 0);
    return {
      userEnteredValue: { numberValue: (hour * 60 + minute) / 1440 },
      userEnteredFormat: {
        numberFormat: { type: "TIME", pattern: "h:mm am/pm" },
      },
    };
  }
  if (typeof value === "number") {
    return { userEnteredValue: { numberValue: value } };
  }
  return { userEnteredValue: { stringValue: String(value || "") } };
}

async function appendEntry(sheets, targetSpreadsheetId, row) {
  const sheetId = await getEntriesSheetId(sheets, targetSpreadsheetId);
  return sheets.spreadsheets.batchUpdate({
    spreadsheetId: targetSpreadsheetId,
    requestBody: {
      requests: [{
        appendCells: {
          sheetId,
          rows: [{
            values: row.map((value, index) => entryCellData(value, index)),
          }],
          fields: "userEnteredValue,userEnteredFormat.numberFormat",
        },
      }],
    },
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

function onCallRow(userId, scheduleId, member, schedule) {
  const completedAtSerial =
    new Date(schedule.endDateTime).getTime() / 86400000 + 25569;
  return [
    userId,
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
    range: "'On Call'!B:B",
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
      range: "'On Call'!A:M",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });
  }
  return sheets.spreadsheets.values.update({
    spreadsheetId: targetSpreadsheetId,
    range: `'On Call'!A${rowNumber}:M${rowNumber}`,
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
      const caseSynced = normalizeSalesforceCase(entry.salesforceCase)
        ? await upsertSalesforceCaseEntry(sheets, entryId, entry)
        : false;

      console.log(
        `syncEntryToGoogleSheets success: userId=${userId}, entryId=${entryId}, destinations=${results.length}, salesforceCaseSynced=${caseSynced}`,
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
    const caseSynced = normalizeSalesforceCase(after.salesforceCase)
      ? await upsertSalesforceCaseEntry(sheets, entryId, after)
      : normalizeSalesforceCase(before.salesforceCase)
        ? await deleteSalesforceCaseEntry(sheets, entryId)
        : false;
    console.log(
      `updateEntryInGoogleSheets success: entryId=${entryId}, destinations=${afterIds.length}, salesforceCaseSynced=${caseSynced}`,
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
    const caseDeleted = normalizeSalesforceCase(entry.salesforceCase)
      ? await deleteSalesforceCaseEntry(sheets, entryId)
      : false;
    console.log(
      `deleteEntryFromGoogleSheets success: entryId=${entryId}, destinations=${results.filter(Boolean).length}, salesforceCaseDeleted=${caseDeleted}`,
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
    const destinations = [
      ["GOOGLE_SHEET_TEAM_ID", teamSpreadsheetId],
      ["GOOGLE_SHEET_MEMBER_REPORTS_ID", memberReportsSpreadsheetId],
    ];
    if (memberConfig.envName) {
      destinations.unshift([memberConfig.envName, memberConfig.id]);
    }
    const targetSpreadsheetIds = requiredSpreadsheetIds(destinations);

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
      userId,
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

export const archiveMonthlyGoogleSheetReports = onSchedule(
  {
    schedule: "10 0 1 * *",
    timeZone,
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    const archivedMonth = previousReportingMonth();
    const currentMonth = reportingMonth();
    console.log(`Starting monthly report archive for ${archivedMonth}`);
    await createMonthlyReportArchive(archivedMonth);
    await setCurrentReportingMonth(currentMonth);
  },
);
