import { stripCRLF } from "./string_utils";

export type HeaderRow = { key: string; value: string };

function sanitizeHeaderPart(s: string): string {
  return stripCRLF(s).trim();
}

export function sanitizeHeadersArray(rows: HeaderRow[]): HeaderRow[] {
  return rows
    .map(({ key, value }) => ({
      key: sanitizeHeaderPart(key),
      value: sanitizeHeaderPart(value),
    }))
    .filter(({ key, value }) => key.length > 0 && value.length > 0);
}

export function headersArrayToRecord(
  rows: HeaderRow[] | null | undefined,
  opts?: { stripAuthorization?: boolean }
): Record<string, string> {
  if (!rows) {
    return Object.fromEntries([]);
  }

  const sanitized = sanitizeHeadersArray(rows);
  let entries = sanitized.map(({ key, value }) => [key, value]);

  if (opts?.stripAuthorization) {
    entries = entries.filter(([k]) => k.toLowerCase() !== "authorization");
  }
  return Object.fromEntries(entries);
}
