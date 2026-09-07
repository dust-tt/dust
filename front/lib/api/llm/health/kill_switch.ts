import { makeCachedKillSwitch } from "@app/lib/api/kill_switch_cache";

// How long a pod may serve a stale value of the kill switch.
const REFRESH_INTERVAL_MS = 60 * 1000;

const isDetectionPaused = makeCachedKillSwitch("pause_model_health_detection", {
  refreshIntervalMs: REFRESH_INTERVAL_MS,
});

/**
 * Whether to stop recording attempts and detecting breaches, toggled from Poke.
 *
 * The whole point of an operator switch here is that it works during an
 * incident, when shipping a revert is exactly what we cannot afford. It is read
 * on every attempt, so it comes from an in-process cache rather than Redis --
 * consulting Redis to decide whether to write to Redis would be self-defeating
 * on the one failure this path most needs to survive.
 *
 * Recovery workflows already running are not affected: they only probe and log,
 * and they end on their own.
 */
export function isModelHealthDetectionPaused(): boolean {
  return isDetectionPaused();
}
