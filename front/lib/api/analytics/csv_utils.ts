import { stringify } from "csv-stringify/sync";

// Sanitize CSV cells to prevent formula injection when opened in spreadsheets.
// Prefixes dangerous leading characters (=, +, -, @) with an apostrophe.
export function sanitizeCsvCell(value: string | number): string | number {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

// Raw division results carry long float tails which spreadsheet apps render
// as text rather than a number. Round to two decimals so every numeric cell
// serializes as a plain, consistently-typed number.
export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

// Serialize keyed rows to CSV with a header row, sanitizing every cell. Shared
// serializer for all analytics CSV exports.
export function rowsToCsv<
  K extends string,
  R extends Record<K, string | number>,
>(headers: readonly K[], rows: readonly R[]): string {
  const csvData = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h]))
  );
  return stringify([[...headers], ...csvData], { header: false });
}
