import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// How long a pod may serve a stale value of the kill switch.
const REFRESH_INTERVAL_MS = 60 * 1000;

let cachedValue = false;
let lastRefreshStartedAt = 0;
let refreshing = false;

/**
 * Whether to serve permission decisions from the legacy inline-group ACLs instead of the
 * `group_permissions` table — the revert path for the governance migration, toggled from Poke.
 *
 * Read synchronously because permission checks are: `canWrite` runs inside `toJSON` and inside
 * array predicates. The kill switch itself lives in Redis, so this keeps the last known value in
 * process and refreshes it in the background at most every REFRESH_INTERVAL_MS. Consequences:
 * enabling it in Poke takes effect within that window on each pod, and a pod serves the new path
 * until its first refresh resolves (a few ms after boot).
 *
 * Temporary — delete along with the legacy path once the table is trusted.
 */
export function isLegacyAclsEnabled(): boolean {
  const now = Date.now();
  if (!refreshing && now - lastRefreshStartedAt > REFRESH_INTERVAL_MS) {
    refreshing = true;
    lastRefreshStartedAt = now;

    void KillSwitchResource.isKillSwitchEnabled("use_legacy_acls")
      .then((enabled) => {
        cachedValue = enabled;
      })
      .catch((err) => {
        // Keep the last known value: a Redis blip must not flip permission behaviour.
        logger.error(
          { err: normalizeError(err) },
          "Failed to refresh the use_legacy_acls kill switch"
        );
      })
      .finally(() => {
        refreshing = false;
      });
  }

  return cachedValue;
}
