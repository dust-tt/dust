import {
  baseUniquenessKey,
  clearMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { listMetronomeAlerts } from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  PER_USER_CREDIT_USER_CUSTOM_FIELD_KEY,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import { SEAT_LOW_BALANCE_FRACTION } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// The two per-user credit-balance alerts for one seat (id + current evaluation
// status), surfaced (e.g. in poke) so the UI can render each balance badge with
// `AlertChip` — colored by status and deep-linked to Metronome.
export type PerUserCreditAlerts = {
  low: MetronomeAlertRef | null;
  empty: MetronomeAlertRef | null;
};

// A free seat's AWU credit is a per-user contract credit (not a seat balance),
// so the seat-balance alert can't track it. Metronome alerts can filter on a
// credit's custom field but not on its presentation specifier, so we scope a
// per-user `low_remaining_contract_credit_balance_reached` alert to the credit
// stamped with this user's sId (`DUST_PER_USER_CREDIT_USER`). Two alerts per
// user mirror the seat-balance bands, distinguished by `threshold` in the
// webhook payload (the same way `low_remaining_seat_balance_reached` is
// handled): the exhaustion alert (threshold 0) drives `capped`, the low-balance
// alert (threshold = 20% of the allowance) drives `user_seat_low_balance`.

// The webhook event for `low_remaining_contract_credit_balance_reached` carries
// no `credit_id` for a custom-field-filtered alert, so the handler resolves the
// seat user from the alert NAME. Build and parse it here so the two never drift
// — the userId is always the last whitespace-delimited token (sIds have no
// spaces).
const PER_USER_CREDIT_ALERT_NAME_PREFIX = "Per-user free credit";

function perUserCreditAlertName(
  band: "exhausted" | "low balance",
  workspaceId: string,
  userId: string
): string {
  return `${PER_USER_CREDIT_ALERT_NAME_PREFIX} ${band} ${workspaceId} ${userId}`;
}

/**
 * Extract the seat user sId from a per-user credit-balance alert name (the
 * inverse of `perUserCreditAlertName`). Returns null for any non-matching name.
 */
export function parsePerUserCreditAlertUserId(
  alertName: string | null | undefined
): string | null {
  if (!alertName?.startsWith(PER_USER_CREDIT_ALERT_NAME_PREFIX)) {
    return null;
  }
  const tokens = alertName.trim().split(/\s+/);
  return tokens.at(-1) ?? null;
}

function exhaustionAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-credit-exhausted-${workspaceId}-`;
}

function lowBalanceAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `per-user-credit-low-${workspaceId}-`;
}

function exhaustionAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${exhaustionAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

function lowBalanceAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${lowBalanceAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

/**
 * Map each free-seat user in a workspace to their per-user credit-balance alert
 * ids (low + empty), built from the alerts whose uniqueness key matches the
 * per-user-credit patterns for this workspace. Mirrors
 * `listMetronomePerUserCapsForWorkspace`; used to link the poke balance badges
 * to their Metronome alerts.
 */
export async function listPerUserCreditBalanceAlertsForWorkspace({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<Map<string, PerUserCreditAlerts>, Error>> {
  const lowPrefix = lowBalanceAlertUniquenessKeyPrefix(workspaceId);
  const emptyPrefix = exhaustionAlertUniquenessKeyPrefix(workspaceId);
  const byUser = new Map<string, PerUserCreditAlerts>();
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (!key) {
        continue;
      }
      const baseKey = baseUniquenessKey(key);
      const isLow = baseKey.startsWith(lowPrefix);
      const userId = isLow
        ? baseKey.slice(lowPrefix.length)
        : baseKey.startsWith(emptyPrefix)
          ? baseKey.slice(emptyPrefix.length)
          : null;
      if (!userId) {
        continue;
      }
      const ref: MetronomeAlertRef = {
        id: entry.alert.id,
        status: entry.customer_status,
      };
      const alerts = byUser.get(userId) ?? { low: null, empty: null };
      if (isLow) {
        alerts.low = ref;
      } else {
        alerts.empty = ref;
      }
      byUser.set(userId, alerts);
    }
    return new Ok(byUser);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

function perUserCreditFilter(userId: string) {
  return [
    {
      entity: "ContractCredit" as const,
      key: PER_USER_CREDIT_USER_CUSTOM_FIELD_KEY,
      value: userId,
    },
  ];
}

/**
 * Idempotently ensure the two per-user credit-balance alerts (exhaustion at 0,
 * low balance at 20% of the allowance) exist for a free seat user. Both filter
 * on the credit's `DUST_PER_USER_CREDIT_USER` custom field so Metronome
 * evaluates only that user's credit. Best-effort caller: alert failures must
 * not fail the grant.
 */
export async function upsertPerUserCreditBalanceAlerts({
  metronomeCustomerId,
  workspaceId,
  userId,
  allowanceAwu,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
  allowanceAwu: number;
}): Promise<Result<void, Error>> {
  const creditTypeId = getCreditTypeAwuId();

  const exhaustionResult = await upsertMetronomeAlert({
    alert_type: "low_remaining_contract_credit_balance_reached",
    name: perUserCreditAlertName("exhausted", workspaceId, userId),
    threshold: 0,
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    uniqueness_key: exhaustionAlertUniquenessKey(workspaceId, userId),
    custom_field_filters: perUserCreditFilter(userId),
  });
  if (exhaustionResult.isErr()) {
    return new Err(exhaustionResult.error);
  }

  const lowBalanceResult = await upsertMetronomeAlert({
    alert_type: "low_remaining_contract_credit_balance_reached",
    name: perUserCreditAlertName("low balance", workspaceId, userId),
    threshold: Math.floor(SEAT_LOW_BALANCE_FRACTION * allowanceAwu),
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    uniqueness_key: lowBalanceAlertUniquenessKey(workspaceId, userId),
    custom_field_filters: perUserCreditFilter(userId),
  });
  if (lowBalanceResult.isErr()) {
    return new Err(lowBalanceResult.error);
  }

  logger.info(
    { workspaceId, userId, metronomeCustomerId, allowanceAwu },
    "[Metronome PerUserCredit] Synced per-user credit-balance alerts"
  );
  return new Ok(undefined);
}

/**
 * Archive both per-user credit-balance alerts for a user. Idempotent — no-op
 * when no matching alert exists. Call when a user leaves the free seat so the
 * alerts don't accumulate.
 */
export async function clearPerUserCreditBalanceAlerts({
  metronomeCustomerId,
  workspaceId,
  userId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  userId: string;
}): Promise<Result<void, Error>> {
  for (const uniquenessKey of [
    exhaustionAlertUniquenessKey(workspaceId, userId),
    lowBalanceAlertUniquenessKey(workspaceId, userId),
  ]) {
    const result = await clearMetronomeAlert({
      metronomeCustomerId,
      uniquenessKey,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
  }
  return new Ok(undefined);
}
