import { stripCRLF } from "./string_utils";

export type HeaderRow = { key: string; value: string };
export type MetaRow = { key: string; value: string };

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

// Counterpart of `encodeUtf8HeaderValue` in @dust-tt/client
// (sdks/js/src/http_headers.ts): DustAPI carries non-Latin-1 extra header
// values (emoji or non-Latin scripts in API key names, internationalized user
// emails) as RFC 2047 encoded-words (`=?utf-8?B?<base64>?=`) since HTTP header
// values must fit in ISO-8859-1. This decodes them on the receiving end;
// anything that isn't a well-formed encoded-word is returned as-is.
const ENCODED_WORD_REGEX = /^=\?utf-8\?B\?([A-Za-z0-9+/]*={0,2})\?=$/i;

export function decodeUtf8HeaderValue(value: string): string {
  const match = value.match(ENCODED_WORD_REGEX);
  if (!match) {
    return value;
  }
  return Buffer.from(match[1], "base64").toString("utf8");
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
