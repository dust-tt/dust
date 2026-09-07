import type { KillSwitchType } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * A kill switch read as a plain synchronous boolean, kept in process.
 *
 * `KillSwitchResource` reads Redis, and falls back to the database when that
 * fails: far too much for a switch consulted on every call of a hot path. This
 * keeps the last known value in process and refreshes it in the background at
 * most once per `refreshIntervalMs`.
 *
 * Consequences: toggling the switch in Poke takes effect within that window on
 * each pod, a pod reads `false` until its first refresh resolves (a few ms
 * after boot), and a Redis or database blip leaves the last known value in
 * place rather than flipping behaviour.
 */
export function makeCachedKillSwitch(
  type: KillSwitchType,
  { refreshIntervalMs }: { refreshIntervalMs: number }
): () => boolean {
  let cachedValue = false;
  let lastRefreshStartedAtMs = 0;
  let refreshing = false;

  return function isEnabled(): boolean {
    const nowMs = Date.now();
    if (!refreshing && nowMs - lastRefreshStartedAtMs > refreshIntervalMs) {
      refreshing = true;
      lastRefreshStartedAtMs = nowMs;

      void KillSwitchResource.isKillSwitchEnabled(type)
        .then((enabled) => {
          cachedValue = enabled;
        })
        .catch((err) => {
          logger.error(
            { err: normalizeError(err), killSwitch: type },
            "Failed to refresh a kill switch"
          );
        })
        .finally(() => {
          refreshing = false;
        });
    }

    return cachedValue;
  };
}
