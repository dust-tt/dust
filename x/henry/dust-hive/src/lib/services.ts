// Service names - array order defines start order, reverse for stop order.
//
// The "front" service is gone: its public port slot (base+0) now hosts the
// in-hive HTTP `proxy` that routes /api/* to front-api and everything else to
// marketing. front-api lives on its own dedicated port (frontApi slot).
export const ALL_SERVICES = [
  "sdk",
  "sparkle",
  "front-api",
  "marketing",
  "proxy",
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
