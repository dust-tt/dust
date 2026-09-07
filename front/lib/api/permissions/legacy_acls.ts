import { makeCachedKillSwitch } from "@app/lib/api/kill_switch_cache";

// How long a pod may serve a stale value of the kill switch.
const REFRESH_INTERVAL_MS = 60 * 1000;

const isLegacyAclsKillSwitchEnabled = makeCachedKillSwitch("use_legacy_acls", {
  refreshIntervalMs: REFRESH_INTERVAL_MS,
});

/**
 * Whether to serve permission decisions from the legacy inline-group ACLs instead of the
 * `group_permissions` table — the revert path for the governance migration, toggled from Poke.
 *
 * Read synchronously because permission checks are: `canWrite` runs inside `toJSON` and inside
 * array predicates. The kill switch itself lives in Redis, so `makeCachedKillSwitch` keeps the
 * last known value in process and refreshes it in the background at most every
 * REFRESH_INTERVAL_MS.
 *
 * Temporary — delete along with the legacy path once the table is trusted.
 */
export function isLegacyAclsEnabled(): boolean {
  return isLegacyAclsKillSwitchEnabled();
}
