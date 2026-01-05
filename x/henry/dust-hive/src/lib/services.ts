// Service names - array order defines start order, reverse for stop order
export const ALL_SERVICES = [
  "sdk",
  "front",
  "core",
  "oauth",
  "connectors",
  "front-workers",
] as const;

export type ServiceName = (typeof ALL_SERVICES)[number];
