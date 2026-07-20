// HTTP header values must fit in ISO-8859-1: fetch throws on any code point
// above 0xFF, and Node rejects control characters. Extra header values that
// don't fit (emoji or non-Latin scripts in API key names, internationalized
// user emails) are carried as an RFC 2047 encoded-word (`=?utf-8?B?<base64>?=`)
// and decoded on the receiving end (`decodeUtf8HeaderValue` in
// front/types/shared/utils/http_headers.ts). Latin-1-safe values pass through
// raw, so the common case stays readable in logs and unencoded for receivers
// that don't decode.
const NON_LATIN1_HEADER_VALUE_REGEX = /[^\x20-\x7e\x80-\xff]/u;
const ENCODED_WORD_REGEX = /^=\?utf-8\?B\?[A-Za-z0-9+/]*={0,2}\?=$/i;

// btoa over TextEncoder bytes rather than Buffer: this runs in browser
// consumers of the SDK where Buffer is not available.
function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function encodeUtf8HeaderValue(value: string): string {
  // A raw value that itself looks like an encoded-word is also encoded, so
  // decoding is unambiguous.
  if (
    !NON_LATIN1_HEADER_VALUE_REGEX.test(value) &&
    !ENCODED_WORD_REGEX.test(value)
  ) {
    return value;
  }
  return `=?utf-8?B?${toBase64Utf8(value)}?=`;
}
