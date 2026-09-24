const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const repoRoot = path.resolve(__dirname, "..");
const inputPath = path.join(repoRoot, "info_participants.xlsx");
const outputPath = path.join(repoRoot, "config", "baseline.json");

function normalizeCellValue(value) {
  if (value === undefined) {
    return null;
  }

  if (value && typeof value === "object") {
    if ("result" in value) {
      return normalizeCellValue(value.result);
    }
    if ("text" in value) {
      return value.text;
    }
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("hyperlink" in value) {
      return value.text || value.hyperlink;
    }
  }

  return value;
}

async function buildBaseline() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const output = {};

  workbook.eachSheet((worksheet) => {
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values
      .slice(1)
      .map((header) => (header == null ? "" : String(header).trim()));

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const rowObject = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        const value = normalizeCellValue(row.getCell(index + 1).value);
        rowObject[header] = value;
        if (value !== null && value !== "") {
          hasValue = true;
        }
      });

      if (hasValue) {
        rows.push(rowObject);
      }
    });

    output[worksheet.name] = rows;
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

buildBaseline().catch((error) => {
  console.error(error);
  process.exit(1);
});
