import { makeCachedKillSwitch } from "@app/lib/api/kill_switch_cache";

// How long a pod may serve a stale value of the kill switch.
const REFRESH_INTERVAL_MS = 60 * 1000;

const isLegacyAclsKillSwitchEnabled = makeCachedKillSwitch("use_legacy_acls", {
  refreshIntervalMs: REFRESH_INTERVAL_MS,
  initialValue: true,
});

/**
 * Whether to serve permission decisions from the legacy inline-group ACLs instead of the
 * `group_permissions` table — the revert path for the governance migration, toggled from Poke.
 *
 * Read synchronously from the last known value, refreshed in the background at most every
 * REFRESH_INTERVAL_MS. Serve legacy reads until the first successful refresh.
 *
 * Temporary — delete along with the legacy path once the table is trusted.
 */
/**
 * @cc [owner:philipperolet,label:security] agent-read-rollout
 * Agent reads must use legacy permissions while `use_legacy_acls` is enabled or its initial
 * value is unknown. Once disabled, grant read failures must propagate without legacy fallback.
 */
export function isLegacyAclsEnabled(): boolean {
  return isLegacyAclsKillSwitchEnabled();
}
