/**
 * Generate a sample CSV file with configurable dimensions and cell length.
 *
 * Usage:
 *   npx tsx admin/generate_sample_csv.ts \
 *     --fileName output.csv \
 *     --columns 5 \
 *     --rows 100 \
 *     --cellLength 20
 */

import * as fs from "fs";
import * as path from "path";

interface Args {
  fileName: string;
  columns: number;
  rows: number;
  cellLength: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (!value) {
      throw new Error(`Missing value for --${key}`);
    }
    map.set(key, value);
  }

  const required = ["fileName", "columns", "rows", "cellLength"];
  for (const key of required) {
    if (!map.has(key)) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }

  return {
    fileName: map.get("fileName")!,
    columns: parseInt(map.get("columns")!, 10),
    rows: parseInt(map.get("rows")!, 10),
    cellLength: parseInt(map.get("cellLength")!, 10),
  };
}

const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function main() {
  const args = parseArgs();

  const headers = Array.from(
    { length: args.columns },
    (_, i) => `col_${i + 1}`
  );

  const lines: string[] = [headers.map(escapeCsvField).join(",")];

  for (let r = 0; r < args.rows; r++) {
    const row = Array.from({ length: args.columns }, () =>
      randomString(args.cellLength)
    );
    lines.push(row.map(escapeCsvField).join(","));
  }

  const output = lines.join("\n") + "\n";
  const filePath = path.resolve(args.fileName);
  fs.writeFileSync(filePath, output);

  const sizeBytes = Buffer.byteLength(output);
  console.log(
    `Generated ${filePath} (${args.columns} columns, ${args.rows} rows, ${args.cellLength} chars/cell, ${(sizeBytes / 1024).toFixed(1)} KB)`
  );
}

main();
