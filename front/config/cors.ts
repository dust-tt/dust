const STATIC_ALLOWED_ORIGINS = [
  // Front extension.
  "https://front-ext.dust.tt",
  // Chrome extension.
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
  // Documentation website.
  "https://docs.dust.tt",
  // Microsoft Power Automate.
  "https://make.powerautomate.com",
] as const;

const ALLOWED_ORIGIN_PATTERNS = [
  // Zendesk domains
  new RegExp("^https://.+\\.zendesk\\.com$"),
] as const;

type StaticAllowedOriginType = (typeof STATIC_ALLOWED_ORIGINS)[number];

export function isAllowedOrigin(origin: string): boolean {
  return (
    STATIC_ALLOWED_ORIGINS.includes(origin as StaticAllowedOriginType) ||
    ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
  );
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
