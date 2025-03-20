const ALLOWED_ORIGINS = ["https://front-ext.dust.tt"] as const;
type AllowedOriginType = (typeof ALLOWED_ORIGINS)[number];

export function isAllowedOrigin(origin: string): origin is AllowedOriginType {
  return ALLOWED_ORIGINS.includes(origin as AllowedOriginType);
}

export const DEV_ORIGIN = "http://localhost:3010" as const;
