// Service names - array order defines start order, reverse for stop order
export const ALL_SERVICES = [
  "sdk",
  "sparkle",
  "front",
  "core",
  "oauth",
  "connectors",
  "front-workers",
  "front-spa-poke",
  "front-spa-app",
] as const;

export type ServiceName = (typeof ALL_SERVICES)[number];

/**
 * Type guard to check if a string is a valid service name.
 */
export function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}
