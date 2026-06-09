// Service names - array order defines start order, reverse for stop order.
// The API is served exclusively by front-api (Hono); the old Next server
// (`front`) no longer serves any endpoint and is not run by the hive.
export const ALL_SERVICES = [
  "sdk",
  "sparkle",
  "front-api",
  "core",
  "oauth",
  "connectors",
  "front-workers",
  "front-spa-poke",
  "front-spa-app",
  "viz",
] as const;

// Services that run in "cold" state (build watchers)
export const COLD_STATE_SERVICES = ["sdk", "sparkle"] as const satisfies readonly ServiceName[];

export type ServiceName = (typeof ALL_SERVICES)[number];

/**
 * Type guard to check if a string is a valid service name.
 */
export function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}
