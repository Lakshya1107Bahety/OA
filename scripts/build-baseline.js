const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const repoRoot = path.resolve(__dirname, "..");
const inputPath = path.join(repoRoot, "info_participants.xlsx");
const outputPath = path.join(repoRoot, "config", "baseline.json");

const workbook = XLSX.readFile(inputPath);
const output = {};

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  output[sheetName] = XLSX.utils.sheet_to_json(sheet, { defval: null });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
