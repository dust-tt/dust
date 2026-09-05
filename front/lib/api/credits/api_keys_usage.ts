import { makeApiKeySpendLimitAwuCreditsRateLimitKey } from "@app/lib/api/assistant/rate_limits";
import type { RateLimiterState } from "@app/lib/api/credits/members_usage";
import { fetchConsumedAwuCreditsByApiKeyName } from "@app/lib/api/credits/members_usage";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { USER_AWU_WARNING_PERCENTAGE } from "@app/lib/metronome/alerts/spend_limits";
import { fetchPerApiKeyAwuUsage } from "@app/lib/metronome/per_api_key_usage";
import { KeyResource } from "@app/lib/resources/key_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getFixedWindowCount } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { ApiKeyCreditState } from "@app/types/key";
import type { LightWorkspaceType } from "@app/types/user";

export type ApiKeyUsageType = {
  name: string;
  isActive: boolean;
  creditState: ApiKeyCreditState;
  // Elasticsearch-derived AWU consumption for the current billing cycle, summed
  // on `api_key_name`. Caps are per-name (Metronome aggregates spend by name),
  // so keys sharing a name report the same figure.
  consumedAwuCredits: number;
  // AWU credits recorded in the Redis fixed-window spend-cap counter for the
  // current billing cycle — the value enforcement reads. Unlike the two other
  // figures this one is per key, not per name. Null when the billing period
  // can't be resolved.
  rateLimiterSpendAwuCredits: number | null;
  // The rate-limiter's verdict for this key's cap: "capped" (counter ≥ cap),
  // "near_limit" (≥ 80%), or "ok", from `rateLimiterSpendAwuCredits` vs
  // `monthlyCapAwuCredits`. Null when the key has no cap or the counter couldn't
  // be read. Independent of the enforcement flag (surfaced beside the Metronome
  // "Credit state" column to spot divergence).
  rateLimiterState: RateLimiterState | null;
  // Metronome-side per-API-key AWU consumption for the current billing cycle
  // (the value reconcile and the cap alert read). Null when Metronome isn't
  // configured or the read failed.
  metronomeConsumedAwuCredits: number | null;
  monthlyCapAwuCredits: number | null;
};

export type GetApiKeysUsageResponseBody = {
  keys: ApiKeyUsageType[];
};

/**
 * Metronome-side consumption per API key name for the current billing period.
 * Resilient: degrades to an empty map when Metronome isn't configured or the
 * read fails, so the table still renders the ES and rate-limiter figures.
 */
async function fetchMetronomeUsageByApiKeyName({
  workspace,
  keyNames,
}: {
  workspace: LightWorkspaceType;
  keyNames: string[];
}): Promise<Map<string, number>> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || keyNames.length === 0) {
    return new Map();
  }
  const result = await fetchPerApiKeyAwuUsage({
    workspaceId: workspace.sId,
    metronomeCustomerId,
    keyNames,
  });
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[ApiKeysUsage] Failed to read per-API-key usage from Metronome, degrading to empty map"
    );
    return new Map();
  }
  return result.value;
}

/**
 * The Redis fixed-window spend-cap counter of each key, keyed by key model id.
 * Empty when the contract billing period can't be resolved (the counter is
 * bucketed on it).
 */
async function fetchRateLimiterSpendByKeyId({
  workspace,
  keys,
}: {
  workspace: LightWorkspaceType;
  keys: KeyResource[];
}): Promise<Map<number, number>> {
  const bounds = await resolveSpendLimitCycleBounds(workspace);
  if (!bounds) {
    return new Map();
  }
  // Redis reads (not database queries), one per non-system key of the workspace.
  const entries = await concurrentExecutor(
    keys,
    async (key) => {
      const result = await getFixedWindowCount({
        key: makeApiKeySpendLimitAwuCreditsRateLimitKey(key.id),
        bounds,
      });
      // The counter stores microCredits; convert back to credits so it lines
      // up with the ES/MT figures (all in credits).
      return [
        key.id,
        result.isOk() ? microCreditsToCredits(result.value) : 0,
      ] as const;
    },
    { concurrency: 8 }
  );
  return new Map(entries);
}

/**
 * Per-API-key credit consumption for the workspace's current billing cycle, as
 * measured by the three independent counters (Elasticsearch, the Redis
 * rate-limiter enforcement reads, and Metronome), alongside each key's cap and
 * credit state. Poke-only: it exists to spot divergence between the three,
 * which points at a counter or metric issue.
 */
export async function getApiKeysUsage(
  auth: Authenticator
): Promise<GetApiKeysUsageResponseBody> {
  const workspace = auth.getNonNullableWorkspace();

  const keys = await KeyResource.listNonSystemKeysByWorkspace(workspace);
  if (keys.length === 0) {
    return { keys: [] };
  }
  // Both the ES aggregation and the Metronome query are scoped by name, and
  // several keys can share one.
  const keyNames = [...new Set(keys.map((key) => key.name))];

  const [consumedByName, metronomeConsumedByName, rateLimiterSpendByKeyId] =
    await Promise.all([
      fetchConsumedAwuCreditsByApiKeyName({
        workspace,
        apiKeyNames: keyNames,
      }),
      fetchMetronomeUsageByApiKeyName({ workspace, keyNames }),
      fetchRateLimiterSpendByKeyId({ workspace, keys }),
    ]);

  const apiKeys = keys.map((key) => {
    const rateLimiterSpendAwuCredits =
      rateLimiterSpendByKeyId.get(key.id) ?? null;
    const cap = key.monthlyCapAwuCredits;
    let rateLimiterState: RateLimiterState | null = null;
    if (cap !== null && cap > 0 && rateLimiterSpendAwuCredits !== null) {
      rateLimiterState =
        rateLimiterSpendAwuCredits >= cap
          ? "capped"
          : rateLimiterSpendAwuCredits >= USER_AWU_WARNING_PERCENTAGE * cap
            ? "near_limit"
            : "ok";
    }
    return {
      name: key.name,
      isActive: key.isActive,
      creditState: key.creditState,
      consumedAwuCredits: consumedByName.get(key.name) ?? 0,
      rateLimiterSpendAwuCredits,
      rateLimiterState,
      metronomeConsumedAwuCredits:
        metronomeConsumedByName.get(key.name) ?? null,
      monthlyCapAwuCredits: key.monthlyCapAwuCredits,
    };
  });

  // Biggest spenders first — the reason to open this table — then by name for a
  // stable order among the keys with no usage this cycle.
  return {
    keys: apiKeys.sort(
      (a, b) =>
        b.consumedAwuCredits - a.consumedAwuCredits ||
        a.name.localeCompare(b.name)
    ),
  };
}
