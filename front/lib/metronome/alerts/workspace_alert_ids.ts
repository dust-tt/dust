import { balanceThresholdAlertUniquenessKey } from "@app/lib/metronome/alerts/balance_threshold";
import type { DefaultMetronomeAlertIds } from "@app/lib/metronome/alerts/default_alerts";
import { DEFAULT_ALERT_UNIQUENESS_KEYS } from "@app/lib/metronome/alerts/default_alerts";
import { programmaticCapUniquenessKeys } from "@app/lib/metronome/alerts/programmatic_cap";
import { usageCapAlertUniquenessKey } from "@app/lib/metronome/alerts/usage_cap";
import { listMetronomeAlerts } from "@app/lib/metronome/client";
import { cacheWithRedis } from "@app/lib/utils/cache";

// All workspace-relevant Metronome alert ids, resolved in a single alert-list
// scan. `null` per slot when that alert isn't configured.
export type WorkspaceMetronomeAlertIds = {
  poolBalance: string | null;
  programmatic: {
    cap: string | null;
    warning: string | null;
    low: string | null;
    critical: string | null;
  };
  usageCap: string | null;
  default: DefaultMetronomeAlertIds;
};

function emptyWorkspaceMetronomeAlertIds(): WorkspaceMetronomeAlertIds {
  return {
    poolBalance: null,
    programmatic: { cap: null, warning: null, low: null, critical: null },
    usageCap: null,
    default: {
      poolEmpty: null,
      poolLow: null,
      poolCritical: null,
      seatEmpty: null,
      seatLowMax: null,
      seatLowPro: null,
    },
  };
}

async function fetchWorkspaceMetronomeAlertIds({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<WorkspaceMetronomeAlertIds> {
  const ids = emptyWorkspaceMetronomeAlertIds();

  const balanceKey = balanceThresholdAlertUniquenessKey(workspaceId);
  const programmaticKeys = programmaticCapUniquenessKeys(workspaceId);
  const usageKey = usageCapAlertUniquenessKey(workspaceId);

  // One pass: dispatch each matched alert id into its slot by uniqueness key.
  const assignById = new Map<string, (id: string) => void>([
    [balanceKey, (id) => (ids.poolBalance = id)],
    [programmaticKeys.cap, (id) => (ids.programmatic.cap = id)],
    [programmaticKeys.warning, (id) => (ids.programmatic.warning = id)],
    [programmaticKeys.low, (id) => (ids.programmatic.low = id)],
    [programmaticKeys.critical, (id) => (ids.programmatic.critical = id)],
    [usageKey, (id) => (ids.usageCap = id)],
    ...(
      Object.entries(DEFAULT_ALERT_UNIQUENESS_KEYS) as [
        keyof DefaultMetronomeAlertIds,
        string,
      ][]
    ).map(
      ([slot, key]) => [key, (id: string) => (ids.default[slot] = id)] as const
    ),
  ]);

  for await (const entry of listMetronomeAlerts({
    customer_id: metronomeCustomerId,
    alert_statuses: ["ENABLED", "DISABLED"],
  })) {
    const key = entry.alert.uniqueness_key;
    if (!key) {
      continue;
    }
    assignById.get(key)?.(entry.alert.id);
  }

  return ids;
}

const WORKSPACE_ALERT_IDS_CACHE_TTL_MS = 60 * 1000;

/**
 * Resolve every workspace-relevant Metronome alert id (pool balance,
 * programmatic cap/warning/low/critical, usage cap, and the account-wide
 * defaults) in a single, Redis-cached alert-list scan. Replaces the half-dozen
 * separate `findMetronomeAlert` lookups the Poke workspace-info page used to do
 * per load. Throws on Metronome failure — callers degrade to nulls.
 */
export const getCachedWorkspaceMetronomeAlertIds = cacheWithRedis(
  fetchWorkspaceMetronomeAlertIds,
  ({ metronomeCustomerId, workspaceId }) =>
    `${metronomeCustomerId}-${workspaceId}`,
  { ttlMs: WORKSPACE_ALERT_IDS_CACHE_TTL_MS }
);
