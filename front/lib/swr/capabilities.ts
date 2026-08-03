import type { SWRConfiguration } from "swr";

const CAPABILITIES_DEDUPING_INTERVAL_MS = 60 * 1000;
const CAPABILITIES_FOCUS_THROTTLE_INTERVAL_MS = 5 * 60 * 1000;

export const CAPABILITIES_SWR_OPTIONS = {
  dedupingInterval: CAPABILITIES_DEDUPING_INTERVAL_MS,
  focusThrottleInterval: CAPABILITIES_FOCUS_THROTTLE_INTERVAL_MS,
} satisfies SWRConfiguration;
