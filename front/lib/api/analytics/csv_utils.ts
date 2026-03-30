// Sanitize CSV cells to prevent formula injection when opened in spreadsheets.
// Prefixes dangerous leading characters (=, +, -, @) with an apostrophe.
export function sanitizeCsvCell(value: string | number): string | number {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}
