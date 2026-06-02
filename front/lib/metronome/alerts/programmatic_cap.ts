import {
  clearMetronomeAlert,
  findMetronomeAlert,
  upsertMetronomeAlert,
} from "@app/lib/metronome/alerts";
import {
  getCreditTypeAwuId,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function programmaticCapUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-${workspaceId}`;
}

function programmaticCapWarningUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-warning-${workspaceId}`;
}

function programmaticCapLowUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-low-${workspaceId}`;
}

function programmaticCapCriticalUniquenessKey(workspaceId: string): string {
  return `programmatic-cap-critical-${workspaceId}`;
}

// Early-warning threshold (as a fraction of the monthly cap) fires a
// notification — no state-machine transition, no throttling. Lets admins
// react before the workspace enters the close-to-cap throttle band.
export const WARNING_BALANCE_RATIO = 0.8;

// Warning thresholds: fire alerts this many credits before the cap.
export const LOW_BALANCE_OFFSET = 100;
export const CRITICAL_BALANCE_OFFSET = 10;

// Alert name prefixes used to identify which alert fired in webhook routing.
export const PROGRAMMATIC_CAP_ALERT_NAME = "Programmatic cap";
export const PROGRAMMATIC_WARNING_BALANCE_ALERT_NAME =
  "Programmatic warning balance";
export const PROGRAMMATIC_LOW_BALANCE_ALERT_NAME = "Programmatic low balance";
export const PROGRAMMATIC_CRITICAL_BALANCE_ALERT_NAME =
  "Programmatic critical balance";

/**
 * Read the current programmatic monthly cap from Metronome. Returns the cap
 * alert threshold (in Programmatic USD credits), or null if no cap is set.
 */
export async function getMetronomeProgrammaticCap({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<number | null, Error>> {
  const result = await findMetronomeAlert({
    metronomeCustomerId,
    uniquenessKey: programmaticCapUniquenessKey(workspaceId),
  });
  if (result.isErr()) {
    return new Err(result.error);
  }
  return new Ok(result.value?.alert.threshold ?? null);
}

/**
 * Idempotently create or update the four programmatic cap alerts:
 *   1. Main cap alert (depleted when reached)
 *   2. Warning balance alert (80% of cap) — notification only, no throttling
 *   3. Low balance alert (cap - 100)
 *   4. Critical balance alert (cap - 10)
 *
 * All four use the AWU credit type and are scoped to `usage_type=programmatic`
 * so contract/pool spend doesn't contribute to the cap thresholds.
 */
export async function upsertMetronomeProgrammaticCapAlerts({
  metronomeCustomerId,
  workspaceId,
  monthlyCapCredits,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  monthlyCapCredits: number;
}): Promise<Result<void, Error>> {
  const creditTypeId = getCreditTypeAwuId();

  // Scope every alert to programmatic AWU usage only, so contract/pool spend
  // doesn't contribute to the cap thresholds.
  const programmaticGroupValues = [
    { key: USAGE_TYPE_GROUP_KEY, value: USAGE_TYPE_PROGRAMMATIC },
  ];

  // Main cap alert.
  const capResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `${PROGRAMMATIC_CAP_ALERT_NAME} ${workspaceId} (${monthlyCapCredits} credits)`,
    threshold: monthlyCapCredits,
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    group_values: programmaticGroupValues,
    uniqueness_key: programmaticCapUniquenessKey(workspaceId),
  });
  if (capResult.isErr()) {
    return new Err(capResult.error);
  }

  // Warning alert (80% of cap).
  const warningThreshold = Math.floor(
    monthlyCapCredits * WARNING_BALANCE_RATIO
  );
  const warningResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `${PROGRAMMATIC_WARNING_BALANCE_ALERT_NAME} ${workspaceId} (${warningThreshold} credits)`,
    threshold: warningThreshold,
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    group_values: programmaticGroupValues,
    uniqueness_key: programmaticCapWarningUniquenessKey(workspaceId),
  });
  if (warningResult.isErr()) {
    return new Err(warningResult.error);
  }

  // Low balance alert (100 credits before cap).
  const lowThreshold = Math.max(0, monthlyCapCredits - LOW_BALANCE_OFFSET);
  const lowResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `${PROGRAMMATIC_LOW_BALANCE_ALERT_NAME} ${workspaceId} (${lowThreshold} credits)`,
    threshold: lowThreshold,
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    group_values: programmaticGroupValues,
    uniqueness_key: programmaticCapLowUniquenessKey(workspaceId),
  });
  if (lowResult.isErr()) {
    return new Err(lowResult.error);
  }

  // Critical balance alert (10 credits before cap).
  const criticalThreshold = Math.max(
    0,
    monthlyCapCredits - CRITICAL_BALANCE_OFFSET
  );
  const criticalResult = await upsertMetronomeAlert({
    alert_type: "spend_threshold_reached",
    name: `${PROGRAMMATIC_CRITICAL_BALANCE_ALERT_NAME} ${workspaceId} (${criticalThreshold} credits)`,
    threshold: criticalThreshold,
    credit_type_id: creditTypeId,
    customer_id: metronomeCustomerId,
    group_values: programmaticGroupValues,
    uniqueness_key: programmaticCapCriticalUniquenessKey(workspaceId),
  });
  if (criticalResult.isErr()) {
    return new Err(criticalResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      monthlyCapCredits,
      warningThreshold,
      lowThreshold,
      criticalThreshold,
    },
    "[Metronome ProgrammaticCap] Synced programmatic cap alerts"
  );
  return new Ok(undefined);
}

/**
 * Archive all four programmatic cap alerts. Idempotent — no-op when no
 * matching alerts exist.
 */
export async function clearMetronomeProgrammaticCapAlerts({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const keys = [
    programmaticCapUniquenessKey(workspaceId),
    programmaticCapWarningUniquenessKey(workspaceId),
    programmaticCapLowUniquenessKey(workspaceId),
    programmaticCapCriticalUniquenessKey(workspaceId),
  ];

  for (const uniquenessKey of keys) {
    const result = await clearMetronomeAlert({
      metronomeCustomerId,
      uniquenessKey,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  logger.info(
    { workspaceId, metronomeCustomerId },
    "[Metronome ProgrammaticCap] Cleared programmatic cap alerts"
  );
  return new Ok(undefined);
}
