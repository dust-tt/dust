const STATIC_ALLOWED_ORIGINS = [
  // Front edge.
  "https://front-edge.dust.tt",
  "https://eu.front-edge.dust.tt",
  // Front extension.
  "https://front-ext.dust.tt",
  // Chrome extension.
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
  // Documentation website.
  "https://docs.dust.tt",
  // Microsoft Power Automate.
  "https://make.powerautomate.com",
  "https://office-addins.dust.tt",
  // Poke SPA (backoffice).
  "https://poke.dust.tt",
  // Main app (front-spa).
  "https://app.dust.tt",
  // Legacy poke (Next.js).
  // TODO(2026-01-28 SPA): Remove once poke.dust.tt is fully rolled out.
  "https://dust.tt",
  "https://eu.dust.tt",
] as const;

const ALLOWED_ORIGIN_PATTERNS = [
  // Zendesk domains
  new RegExp("^https://.+\\.zendesk\\.com$"),
  // Staging apps - allow all builds from *.preview.dust.tt .
  new RegExp("^https://.*\\.preview\\.dust\\.tt$"),
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
  "x-build-date",
  "x-hackerone-research",
  "x-request-origin",
  // Datadog RUM tracing headers (injected automatically by the browser SDK).
  "traceparent",
  "tracestate",
  "x-datadog-origin",
  "x-datadog-parent-id",
  "x-datadog-sampling-priority",
  "x-datadog-trace-id",
] as const;
type AllowedHeaderType = (typeof ALLOWED_HEADERS)[number];

export function isAllowedHeader(header: string): header is AllowedHeaderType {
  return ALLOWED_HEADERS.includes(header as AllowedHeaderType);
}
