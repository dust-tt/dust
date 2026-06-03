import {
  clearMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import { listMetronomeAlerts } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Seat-balance alerts fan out per seat via `seat_filter`. Seat ids in Metronome
// are user sIds, so the seat group key is "user_id".
const SEAT_BALANCE_SEAT_GROUP_KEY = "user_id";

// Exhaustion fires at 0 remaining (allocation-independent → a single alert
// fanned out across all seats). The low-balance warning fires when the
// remaining balance drops to this fraction of the seat's allocation, i.e. when
// the user has spent 80% of their personal credits.
const SEAT_EXHAUSTED_THRESHOLD_AWU = 0;
const SEAT_LOW_BALANCE_REMAINING_RATIO = 0.2;

const SEAT_ALERT_CONCURRENCY = 5;

function seatExhaustedAlertUniquenessKey(workspaceId: string): string {
  return `seat-balance-${workspaceId}`;
}

function seatLowBalanceAlertUniquenessKeyPrefix(workspaceId: string): string {
  return `seat-low-balance-${workspaceId}-`;
}

function seatLowBalanceAlertUniquenessKey(
  workspaceId: string,
  userId: string
): string {
  return `${seatLowBalanceAlertUniquenessKeyPrefix(workspaceId)}${userId}`;
}

export async function upsertMetronomeSeatExhaustedAlert({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<{ alertId: string }, Error>> {
  const upsertResult = await upsertMetronomeAlert({
    alert_type: "low_remaining_seat_balance_reached",
    name: `Seat balance ${workspaceId} (${SEAT_EXHAUSTED_THRESHOLD_AWU} AWU)`,
    threshold: SEAT_EXHAUSTED_THRESHOLD_AWU,
    credit_type_id: getCreditTypeAwuId(),
    customer_id: metronomeCustomerId,
    seat_filter: { seat_group_key: SEAT_BALANCE_SEAT_GROUP_KEY },
    uniqueness_key: seatExhaustedAlertUniquenessKey(workspaceId),
  });
  if (upsertResult.isErr()) {
    return new Err(upsertResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      alertId: upsertResult.value.alertId,
    },
    "[Metronome SeatBalance] Synced seat-exhaustion alert"
  );
  return new Ok({ alertId: upsertResult.value.alertId });
}

async function listSeatLowBalanceAlertUserIds({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<Set<string>, Error>> {
  const prefix = seatLowBalanceAlertUniquenessKeyPrefix(workspaceId);
  const userIds = new Set<string>();
  try {
    for await (const entry of listMetronomeAlerts({
      customer_id: metronomeCustomerId,
      alert_statuses: ["ENABLED"],
    })) {
      const key = entry.alert.uniqueness_key;
      if (key && key.startsWith(prefix)) {
        const userId = key.slice(prefix.length);
        if (userId) {
          userIds.add(userId);
        }
      }
    }
    return new Ok(userIds);
  } catch (err) {
    return new Err(normalizeError(err));
  }
}

/**
 * Sync the per-user seat low-balance alerts for a workspace. For each user with
 * a seat allocation, upserts a `low_remaining_seat_balance_reached` alert at
 * `ceil(20% × allocation)` (fires at 80% spent → `user_seat_low_balance`),
 * scoped to that user via `seat_filter.seat_group_value`. Alerts for users who
 * no longer hold a seat are archived.
 */
export async function syncMetronomeSeatLowBalanceAlerts({
  metronomeCustomerId,
  contractId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  let seatDataByUserId: Map<string, { awuAllocation: number }>;
  try {
    seatDataByUserId = await buildSeatDataByUserId({
      metronomeCustomerId,
      contractId,
      throwOnError: true,
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }

  const existingResult = await listSeatLowBalanceAlertUserIds({
    metronomeCustomerId,
    workspaceId,
  });
  if (existingResult.isErr()) {
    return new Err(existingResult.error);
  }
  const staleUserIds = new Set(existingResult.value);

  const upserts: Array<{
    userId: string;
    thresholdAwu: number;
    awuAllocation: number;
  }> = [];
  for (const [userId, { awuAllocation }] of seatDataByUserId) {
    staleUserIds.delete(userId);
    const thresholdAwu = Math.ceil(
      awuAllocation * SEAT_LOW_BALANCE_REMAINING_RATIO
    );
    if (thresholdAwu <= 0) {
      continue;
    }
    upserts.push({ userId, thresholdAwu, awuAllocation });
  }

  const results = await concurrentExecutor(
    upserts,
    ({ userId, thresholdAwu, awuAllocation }) =>
      upsertMetronomeAlert({
        alert_type: "low_remaining_seat_balance_reached",
        name: `Seat low balance ${workspaceId}-${userId} (${thresholdAwu} AWU  / ${Math.round(SEAT_LOW_BALANCE_REMAINING_RATIO * 100)}% of ${awuAllocation} )`,
        threshold: thresholdAwu,
        credit_type_id: getCreditTypeAwuId(),
        customer_id: metronomeCustomerId,
        seat_filter: {
          seat_group_key: SEAT_BALANCE_SEAT_GROUP_KEY,
          seat_group_value: userId,
        },
        uniqueness_key: seatLowBalanceAlertUniquenessKey(workspaceId, userId),
      }),
    { concurrency: SEAT_ALERT_CONCURRENCY }
  );
  for (const result of results) {
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  // Archive alerts for users who no longer hold a seat.
  const clears = await concurrentExecutor(
    [...staleUserIds],
    (userId) =>
      clearMetronomeAlert({
        metronomeCustomerId,
        uniquenessKey: seatLowBalanceAlertUniquenessKey(workspaceId, userId),
      }),
    { concurrency: SEAT_ALERT_CONCURRENCY }
  );
  for (const result of clears) {
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      upserted: upserts.length,
      cleared: staleUserIds.size,
    },
    "[Metronome SeatBalance] Synced per-user seat low-balance alerts"
  );
  return new Ok(undefined);
}
