// Service names - array order defines start order, reverse for stop order.
// "front" and "front-api" are mutually exclusive: exactly one of them is in
// the active service set for a given hive run (see getActiveServices).
export const ALL_SERVICES = [
  "sdk",
  "sparkle",
  "front",
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

// When set, the hive runs front-api (Hono+Next hybrid server out of front-api/)
// instead of the plain Next server out of front/. The two services share the
// "front" port slot; opt-in via env var for now until front-api is the default.
export function useFrontApi(): boolean {
  const v = process.env["DUST_HIVE_USE_FRONT_API"];
  return v === "1" || v === "true";
}

// Returns whichever front variant is active for this hive run.
export function getFrontService(): ServiceName {
  return useFrontApi() ? "front-api" : "front";
}

// Returns the services that apply to the current hive run. front-api and front
// are mutually exclusive — useFrontApi() picks which one is active.
export function getActiveServices(): readonly ServiceName[] {
  const excluded: ServiceName = useFrontApi() ? "front" : "front-api";
  return ALL_SERVICES.filter((s) => s !== excluded);
}

/**
 * Type guard to check if a string is a valid service name.
 */
export function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}
