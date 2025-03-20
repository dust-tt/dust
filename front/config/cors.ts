const ALLOWED_ORIGINS = ["https://front-ext.dust.tt"] as const;
type AllowedOriginType = (typeof ALLOWED_ORIGINS)[number];

export function isAllowedOrigin(origin: string): origin is AllowedOriginType {
  return ALLOWED_ORIGINS.includes(origin as AllowedOriginType);
}

export const DEV_ORIGIN = "http://localhost:3010" as const;

export const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-request-origin",
  "x-commit-hash",
  "x-dust-extension-version",
] as const;
type AllowedHeaderType = (typeof ALLOWED_HEADERS)[number];

export function isAllowedHeader(header: string): header is AllowedHeaderType {
  return ALLOWED_HEADERS.includes(header as AllowedHeaderType);
}
