import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  clearMetronomeBalanceThresholdAlert,
  getCachedWorkspaceBalanceThreshold,
  upsertMetronomeBalanceThresholdAlert,
} from "@app/lib/metronome/alerts/balance_threshold";
import {
  clearWorkspaceBalanceThresholdReached,
  setWorkspaceBalanceThresholdReached,
} from "@app/lib/metronome/user_block";
import { notifyAdminsBalanceThresholdReached } from "@app/lib/notifications/workflows/balance-threshold-reached";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Read the workspace's credit-balance-threshold notification setting.
 *
 * Metronome is the source of truth: the setting is the threshold of the
 * workspace's balance-threshold alert (cached in Redis). Returns `null` when no
 * threshold is configured, or when the workspace has no Metronome customer.
 */
export async function getWorkspaceBalanceThreshold(
  auth: Authenticator
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return null;
  }

  const { threshold } = await getCachedWorkspaceBalanceThreshold({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  return threshold;
}

/**
 * Persist the workspace's credit-balance-threshold notification setting to its
 * Metronome customer.
 *
 * A strictly positive `balanceThresholdCredits` upserts the balance-threshold
 * alert; 0 or null clears it (the warning is "off"). No-op when the workspace
 * has no Metronome customer. The underlying Metronome calls are idempotent.
 */
export async function syncMetronomeBalanceThresholdAlert({
  auth,
  balanceThresholdCredits,
}: {
  auth: Authenticator;
  balanceThresholdCredits: number | null;
}): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Ok(undefined);
  }

  const shouldAlert =
    balanceThresholdCredits !== null && balanceThresholdCredits > 0;

  const alertResult = shouldAlert
    ? await upsertMetronomeBalanceThresholdAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        balanceThresholdCredits,
        workspaceId: workspace.sId,
      })
    : await clearMetronomeBalanceThresholdAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
      });
  if (alertResult.isErr()) {
    return new Err(
      new Error(
        `Failed to sync Metronome balance threshold alert: ${alertResult.error.message}`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Notify workspace admins that their configured credit-balance threshold has
 * been reached, but only when the firing Metronome alert (`alertId`) is the
 * workspace's own balance-threshold alert — the same `low_remaining_*` event
 * type also fires for unrelated pool alerts, which must not trigger this email.
 *
 * The notification is delivered via Novu (email only for now), triggered once
 * per admin and deduped via a `transactionId` keyed on the Metronome event so
 * redeliveries don't re-send. Best-effort: any failure here is logged and
 * swallowed so it never disrupts the webhook's credit-state processing.
 */
export async function maybeNotifyAdminsBalanceThresholdReached({
  metronomeCustomerId,
  workspaceId,
  eventId,
  alertId,
  remainingBalanceCredits,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  eventId: string;
  alertId: string | null;
  remainingBalanceCredits: number | null;
}): Promise<void> {
  try {
    if (!metronomeCustomerId || !alertId) {
      return;
    }

    const { threshold: thresholdCredits, alertId: configuredAlertId } =
      await getCachedWorkspaceBalanceThreshold({
        metronomeCustomerId,
        workspaceId,
      });

    // Only notify for the workspace's own configured balance-threshold alert.
    if (
      thresholdCredits === null ||
      configuredAlertId === null ||
      configuredAlertId !== alertId
    ) {
      return;
    }

    // Surface the in-app warning banner (admins read this via /usage-status).
    // Cleared on the matching `..._resolved` event when the balance recovers.
    void setWorkspaceBalanceThresholdReached(workspaceId);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.workspace();
    if (!workspace) {
      logger.error(
        { workspaceId },
        "[Balance Threshold] Workspace not found for threshold alert email"
      );
      return;
    }

    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });
    if (admins.length === 0) {
      logger.warn(
        { workspaceId },
        "[Balance Threshold] No active admins for threshold alert email"
      );
      return;
    }

    notifyAdminsBalanceThresholdReached({
      admins: admins.map((admin) => ({
        sId: admin.sId,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      })),
      workspaceId,
      workspaceName: workspace.name,
      balanceThresholdCredits: thresholdCredits,
      remainingBalanceCredits,
      isEnterprise: isEnterprisePlanPrefix(auth.getNonNullablePlan().code),
      eventId,
    });
  } catch (err) {
    logger.error(
      { workspaceId, error: normalizeError(err).message },
      "[Balance Threshold] Failed to notify admins of balance threshold"
    );
  }
}

/**
 * Clear the credit-balance-threshold warning banner when the balance recovers,
 * but only when the firing Metronome alert (`alertId`) is the workspace's own
 * balance-threshold alert — the same `low_remaining_*` event type also resolves
 * for unrelated pool alerts, which must not clear this warning prematurely.
 *
 * Best-effort: any failure is logged and swallowed so it never disrupts the
 * webhook's credit-state processing.
 */
export async function maybeClearAdminsBalanceThresholdReached({
  metronomeCustomerId,
  workspaceId,
  alertId,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  alertId: string | null;
}): Promise<void> {
  try {
    if (!metronomeCustomerId || !alertId) {
      return;
    }

    const { alertId: configuredAlertId } =
      await getCachedWorkspaceBalanceThreshold({
        metronomeCustomerId,
        workspaceId,
      });

    // Only clear for the workspace's own configured balance-threshold alert.
    if (configuredAlertId === null || configuredAlertId !== alertId) {
      return;
    }

    void clearWorkspaceBalanceThresholdReached(workspaceId);
  } catch (err) {
    logger.error(
      { workspaceId, error: normalizeError(err).message },
      "[Balance Threshold] Failed to clear balance threshold warning"
    );
  }
}
