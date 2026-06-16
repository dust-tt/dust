import { balanceThresholdAlertUniquenessKey } from "@app/lib/metronome/alerts/balance_threshold";
import type { DefaultMetronomeAlerts } from "@app/lib/metronome/alerts/default_alerts";
import { DEFAULT_ALERT_UNIQUENESS_KEYS } from "@app/lib/metronome/alerts/default_alerts";
import { programmaticCapUniquenessKeys } from "@app/lib/metronome/alerts/programmatic_cap";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { usageCapAlertUniquenessKey } from "@app/lib/metronome/alerts/usage_cap";
import { listMetronomeAlerts } from "@app/lib/metronome/client";
import { cacheWithRedis } from "@app/lib/utils/cache";

// All workspace-relevant Metronome alerts, resolved in a single alert-list
// scan. `null` per slot when that alert isn't configured. Each slot carries the
// alert id (for deep-linking) and its current evaluation status (for display).
export type WorkspaceMetronomeAlerts = {
  poolBalance: MetronomeAlertRef | null;
  programmatic: {
    cap: MetronomeAlertRef | null;
    warning: MetronomeAlertRef | null;
    low: MetronomeAlertRef | null;
    critical: MetronomeAlertRef | null;
  };
  usageCap: MetronomeAlertRef | null;
  default: DefaultMetronomeAlerts;
};

function emptyWorkspaceMetronomeAlerts(): WorkspaceMetronomeAlerts {
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

async function fetchWorkspaceMetronomeAlerts({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<WorkspaceMetronomeAlerts> {
  const alerts = emptyWorkspaceMetronomeAlerts();

  const balanceKey = balanceThresholdAlertUniquenessKey(workspaceId);
  const programmaticKeys = programmaticCapUniquenessKeys(workspaceId);
  const usageKey = usageCapAlertUniquenessKey(workspaceId);

  // One pass: dispatch each matched alert into its slot by uniqueness key.
  const assignByKey = new Map<string, (ref: MetronomeAlertRef) => void>([
    [balanceKey, (ref) => (alerts.poolBalance = ref)],
    [programmaticKeys.cap, (ref) => (alerts.programmatic.cap = ref)],
    [programmaticKeys.warning, (ref) => (alerts.programmatic.warning = ref)],
    [programmaticKeys.low, (ref) => (alerts.programmatic.low = ref)],
    [programmaticKeys.critical, (ref) => (alerts.programmatic.critical = ref)],
    [usageKey, (ref) => (alerts.usageCap = ref)],
    ...(
      Object.entries(DEFAULT_ALERT_UNIQUENESS_KEYS) as [
        keyof DefaultMetronomeAlerts,
        string,
      ][]
    ).map(
      ([slot, key]) =>
        [key, (ref: MetronomeAlertRef) => (alerts.default[slot] = ref)] as const
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
    assignByKey.get(key)?.({
      id: entry.alert.id,
      status: entry.customer_status,
    });
  }

  return alerts;
}

const WORKSPACE_ALERTS_CACHE_TTL_MS = 60 * 1000;

/**
 * Resolve every workspace-relevant Metronome alert (pool balance, programmatic
 * cap/warning/low/critical, usage cap, and the account-wide defaults) — each
 * with its id (for deep-linking) and current evaluation status (for display) —
 * in a single, Redis-cached alert-list scan. Replaces the half-dozen separate
 * `findMetronomeAlert` lookups the Poke workspace-info page used to do per load.
 * Throws on Metronome failure — callers degrade to nulls.
 */
export const getCachedWorkspaceMetronomeAlerts = cacheWithRedis(
  fetchWorkspaceMetronomeAlerts,
  // `v2` namespaces the cache: a previous version cached bare alert-id strings
  // here; the value shape is now `{ id, status }` objects.
  ({ metronomeCustomerId, workspaceId }) =>
    `v2-${metronomeCustomerId}-${workspaceId}`,
  { ttlMs: WORKSPACE_ALERTS_CACHE_TTL_MS }
);
