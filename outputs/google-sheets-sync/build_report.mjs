import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("./", import.meta.url).pathname;
const workbook = Workbook.create();
const entries = workbook.worksheets.add("Entries");
const summary = workbook.worksheets.add("Monthly Summary");

const navy = "#173C65";
const blue = "#1978D4";
const paleBlue = "#EAF4FE";
const green = "#2B9D77";
const paleGreen = "#E7F7F1";
const gray = "#5F7082";
const lightGray = "#E4EAF0";
const white = "#FFFFFF";

entries.showGridLines = false;
entries.getRange("A1:L1").merge();
entries.getRange("A1").values = [["FADAP Hours — Synced Entries"]];
entries.getRange("A1:L1").format = {
  fill: navy,
  font: { bold: true, color: white, size: 18 },
  rowHeight: 34,
  verticalAlignment: "center",
};
entries.getRange("A2:L2").merge();
entries.getRange("A2").values = [[
  "Each completed timer entry will appear here automatically. Do not enter names or phone numbers in comments.",
]];
entries.getRange("A2:L2").format = {
  fill: paleBlue,
  font: { color: navy, italic: true, size: 10 },
  rowHeight: 28,
  verticalAlignment: "center",
};

const headers = [
  "Entry ID",
  "First Name",
  "Email",
  "Date",
  "Start Time",
  "Month",
  "Category",
  "Subcategory",
  "Comment",
  "Duration Minutes",
  "Duration Hours",
  "Synced At",
];
entries.getRange("A4:L4").values = [headers];
entries.getRange("A4:L4").format = {
  fill: blue,
  font: { bold: true, color: white },
  rowHeight: 28,
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "bottom", style: "medium", color: navy },
};
entries.freezePanes.freezeRows(4);
entries.getRange("D5:D1001").setNumberFormat("yyyy-mm-dd");
entries.getRange("E5:E1001").setNumberFormat("h:mm AM/PM");
entries.getRange("J5:J1001").setNumberFormat("0");
entries.getRange("K5:K1001").setNumberFormat("0.00");
entries.getRange("L5:L1001").setNumberFormat("yyyy-mm-dd h:mm AM/PM");

const widths = [150, 95, 190, 90, 95, 80, 125, 145, 180, 105, 95, 145];
for (let index = 0; index < widths.length; index += 1) {
  entries.getRangeByIndexes(0, index, 1001, 1).format.columnWidthPx = widths[index];
}

summary.showGridLines = false;
summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["FADAP Hours — Monthly Summary"]];
summary.getRange("A1:F1").format = {
  fill: navy,
  font: { bold: true, color: white, size: 18 },
  rowHeight: 36,
  verticalAlignment: "center",
};
summary.getRange("A3").values = [["Report month"]];
summary.getRange("A3").format = { font: { bold: true, color: navy } };
summary.getRange("B3").values = [["2026-08"]];
summary.getRange("B3").format = {
  fill: paleGreen,
  font: { bold: true, color: green },
  borders: { preset: "outside", style: "thin", color: green },
  horizontalAlignment: "center",
};
summary.getRange("A4:F4").merge();
summary.getRange("A4").values = [[
  "Change the report month in B3 using YYYY-MM. Totals update from the Entries tab.",
]];
summary.getRange("A4:F4").format = { font: { italic: true, color: gray, size: 10 } };

summary.getRange("A6:C6").values = [["First Name", "Total Hours", "Entries"]];
summary.getRange("E6:F6").values = [["Category", "Total Hours"]];
for (const rangeName of ["A6:C6", "E6:F6"]) {
  summary.getRange(rangeName).format = {
    fill: blue,
    font: { bold: true, color: white },
    rowHeight: 26,
    borders: { preset: "bottom", style: "medium", color: navy },
  };
}

summary.getRange("A7").formulas = [[
  '=IFERROR(SORT(UNIQUE(FILTER(\'Entries\'!$B$5:$B$1001,\'Entries\'!$B$5:$B$1001<>""))),"")',
]];
summary.getRange("B7").formulas = [[
  '=IF(A7="","",SUMIFS(\'Entries\'!$K$5:$K$1001,\'Entries\'!$B$5:$B$1001,A7,\'Entries\'!$F$5:$F$1001,$B$3))',
]];
summary.getRange("C7").formulas = [[
  '=IF(A7="","",COUNTIFS(\'Entries\'!$B$5:$B$1001,A7,\'Entries\'!$F$5:$F$1001,$B$3))',
]];
summary.getRange("B7:B206").fillDown();
summary.getRange("C7:C206").fillDown();

const categories = [
  "Hotline",
  "Client",
  "FADAP Team",
  "Treatment Center",
  "Peer",
  "Inflight Base",
  "Quick Add",
  "TWU556",
];
summary.getRange("E7:E14").values = categories.map((category) => [category]);
summary.getRange("F7").formulas = [[
  '=SUMIFS(\'Entries\'!$K$5:$K$1001,\'Entries\'!$G$5:$G$1001,E7,\'Entries\'!$F$5:$F$1001,$B$3)',
]];
summary.getRange("F7:F14").fillDown();

summary.getRange("A7:C206").format.borders = {
  insideHorizontal: { style: "thin", color: lightGray },
};
summary.getRange("E7:F14").format.borders = {
  insideHorizontal: { style: "thin", color: lightGray },
};
summary.getRange("B7:B206").setNumberFormat("0.00");
summary.getRange("C7:C206").setNumberFormat("0");
summary.getRange("F7:F14").setNumberFormat("0.00");
summary.getRange("A1:A206").format.columnWidthPx = 155;
summary.getRange("B1:B206").format.columnWidthPx = 105;
summary.getRange("C1:C206").format.columnWidthPx = 80;
summary.getRange("D1:D206").format.columnWidthPx = 24;
summary.getRange("E1:E206").format.columnWidthPx = 155;
summary.getRange("F1:F206").format.columnWidthPx = 105;
summary.freezePanes.freezeRows(6);

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}FADAP-Hours-Google-Sheets.xlsx`);

const entriesPreview = await workbook.render({
  sheetName: "Entries",
  range: "A1:L12",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  `${outputDir}entries-preview.png`,
  new Uint8Array(await entriesPreview.arrayBuffer()),
);
const summaryPreview = await workbook.render({
  sheetName: "Monthly Summary",
  range: "A1:F18",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(
  `${outputDir}summary-preview.png`,
  new Uint8Array(await summaryPreview.arrayBuffer()),
);

console.log(
  (await workbook.inspect({
    kind: "table",
    range: "Monthly Summary!A1:F18",
    include: "values,formulas",
    tableMaxRows: 18,
    tableMaxCols: 6,
  })).ndjson,
);
console.log(
  (await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "final formula error scan",
  })).ndjson,
);
