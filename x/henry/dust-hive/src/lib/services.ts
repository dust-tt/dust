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
  "storybook",
  "sqlite-worker",
  "dfs",
  "collab",
] as const;

// Services that run in "cold" state (build watchers)
export const COLD_STATE_SERVICES = ["sdk", "sparkle"] as const satisfies readonly ServiceName[];

export type ServiceName = (typeof ALL_SERVICES)[number];

// Aliases expanding to several services, e.g. `dust-hive restart front`.
export const SERVICE_ALIASES = {
  front: ["front-api", "front-workers", "front-spa-poke", "front-spa-app"],
} as const satisfies Record<string, readonly ServiceName[]>;

export type ServiceAlias = keyof typeof SERVICE_ALIASES;

// Services an alias also restarts, but only when they are already running. collab runs
// front-api's code, but only co-edition work starts it.
export const SERVICE_ALIAS_RUNNING_COMPANIONS = {
  front: ["collab"],
} as const satisfies Record<ServiceAlias, readonly ServiceName[]>;

/**
 * The services `value` also restarts when they are already running: none unless it is an alias.
 */
export function runningCompanions(value: string): readonly ServiceName[] {
  return isServiceAlias(value) ? SERVICE_ALIAS_RUNNING_COMPANIONS[value] : [];
}

export function isServiceAlias(value: string | undefined): value is ServiceAlias {
  return value !== undefined && Object.hasOwn(SERVICE_ALIASES, value);
}

/**
 * Resolve a service name or alias to the list of services it designates.
 */
export function resolveServices(value: string): readonly ServiceName[] | null {
  if (isServiceName(value)) return [value];
  if (isServiceAlias(value)) return SERVICE_ALIASES[value];
  return null;
}

/**
 * Type guard to check if a string is a valid service name.
 */
export function isServiceName(value: string | undefined): value is ServiceName {
  return value !== undefined && ALL_SERVICES.includes(value as ServiceName);
}
