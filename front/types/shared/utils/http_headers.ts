import { stripCRLF } from "./string_utils";

export type HeaderRow = { key: string; value: string };
export type MetaRow = { key: string; value: string };

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

// HTTP header values must fit in ISO-8859-1: fetch throws on any code point above
// 0xFF, and Node rejects control characters. Replace offending characters so
// attribution values such as API key names or user emails never fail the request.
export function toLatin1SafeHeaderValue(value: string): string {
  return value.replace(/[^\x20-\x7e\x80-\xff]/gu, "?");
}

export function headersArrayToRecord(
  rows: HeaderRow[] | null | undefined
): Record<string, string> {
  if (!rows) {
    return Object.fromEntries([]);
  }

  const sanitized = sanitizeHeadersArray(rows);
  const entries = sanitized.map(({ key, value }) => [key, value]);

  return Object.fromEntries(entries);
}
