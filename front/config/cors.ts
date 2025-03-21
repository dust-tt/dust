const ALLOWED_ORIGINS = [
  // Front extension.
  "https://front-ext.dust.tt",
  // Chrome extension.
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
] as const;
type AllowedOriginType = (typeof ALLOWED_ORIGINS)[number];

export function isAllowedOrigin(origin: string): origin is AllowedOriginType {
  return ALLOWED_ORIGINS.includes(origin as AllowedOriginType);
}

export const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-commit-hash",
  "x-dust-extension-version",
  "x-hackerone-research",
  "x-request-origin",
] as const;
type AllowedHeaderType = (typeof ALLOWED_HEADERS)[number];

export function isAllowedHeader(header: string): header is AllowedHeaderType {
  return ALLOWED_HEADERS.includes(header as AllowedHeaderType);
}
