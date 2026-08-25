import { killedModelIdsFromKillSwitches } from "@app/lib/poke/types";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// How long a pod may serve a stale set of killed models.
const REFRESH_INTERVAL_MS = 60 * 1000;

let cachedKilledModelIds: ReadonlySet<string> = new Set();
let lastRefreshStartedAt = 0;
let refreshing = false;

export function getKilledModelIds(): ReadonlySet<string> {
  const now = Date.now();
  if (!refreshing && now - lastRefreshStartedAt > REFRESH_INTERVAL_MS) {
    refreshing = true;
    lastRefreshStartedAt = now;

    void KillSwitchResource.listEnabledKillSwitches()
      .then((killSwitches) => {
        cachedKilledModelIds = new Set(
          killedModelIdsFromKillSwitches(killSwitches)
        );
      })
      .catch((err) => {
        // Keep the last known set: a Redis blip must not silently un-kill a model.
        logger.error(
          { err: normalizeError(err) },
          "Failed to refresh the killed models"
        );
      })
      .finally(() => {
        refreshing = false;
      });
  }

  return cachedKilledModelIds;
}

export function isModelKilled(modelId: string): boolean {
  return getKilledModelIds().has(modelId);
}
