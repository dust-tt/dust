import { stripCRLF } from "./string_utils";

export type HeaderRow = { key: string; value: string };

export function sanitizeHeaderPart(s: string): string {
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
  opts?: { stripAuthorization?: boolean; emptyAsNull?: boolean }
): Record<string, string> | null | undefined {
  if (!rows) return opts?.emptyAsNull ? null : undefined;

  const sanitized = sanitizeHeadersArray(rows);
  let entries = sanitized.map(({ key, value }) => [key, value] as const);

  if (opts?.stripAuthorization) {
    entries = entries.filter(([k]) => k.toLowerCase() !== "authorization");
  }

  if (entries.length === 0) {
    return opts?.emptyAsNull ? null : undefined;
  }
  return Object.fromEntries(entries);
}
