import {
  isCreditPricedWorkspace,
  PROGRAMMATIC_MONTHLY_CAP_BLOCK_REASON,
} from "@app/lib/api/credits/access_control";
import { runOnRedis } from "@app/lib/api/redis";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { ProgrammaticCapNotificationReason } from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { triggerProgrammaticCapReachedNotifications } from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import logger from "@app/logger/logger";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

const ALERT_REDIS_ORIGIN = "programmatic_cap_trigger_alert" as const;

// Blocked webhook requests can arrive in bursts; before reading anything from
// the database, one cheap Redis claim per workspace throttles the check itself.
const ALERT_CHECK_THROTTLE_SECONDS = 60;

// The sent marker is keyed on the cap state (cap value, billing cycle), so a
// cap change always allows a new email. When a marker expires
// while the workspace is still blocked, the next run sends one reminder.
// A 0 cap has no cycle to roll over on: one reminder per quarter at most.
const DISABLED_CAP_ALERT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days.
// An exhausted positive cap is keyed on the billing cycle, which is monthly, so
// the marker normally goes stale before it expires.
const EXHAUSTED_CAP_ALERT_TTL_SECONDS = 45 * 24 * 60 * 60; // 45 days.

type ProgrammaticCapBlockReason = Extract<
  ProgrammaticCapNotificationReason,
  "programmatic_cap_disabled" | "programmatic_cap_exhausted"
>;

function makeAlertSentKey(idempotencyKey: string): string {
  return `programmatic_cap_trigger_alert:${idempotencyKey}`;
}

// `true` when this run gets to check the cap state for the workspace; `false`
// when another run did so within the throttle window.
async function tryClaimAlertCheck(workspaceId: string): Promise<boolean> {
  const res = await runOnRedis({ origin: ALERT_REDIS_ORIGIN }, (redis) =>
    redis.set(`programmatic_cap_trigger_alert:check:${workspaceId}`, "1", {
      NX: true,
      EX: ALERT_CHECK_THROTTLE_SECONDS,
    })
  );
  return res === "OK";
}

async function wasAlertSent(idempotencyKey: string): Promise<boolean> {
  const value = await runOnRedis({ origin: ALERT_REDIS_ORIGIN }, (redis) =>
    redis.get(makeAlertSentKey(idempotencyKey))
  );
  return value !== null;
}

async function markAlertSent(
  idempotencyKey: string,
  { ttlSeconds }: { ttlSeconds: number }
): Promise<void> {
  await runOnRedis({ origin: ALERT_REDIS_ORIGIN }, (redis) =>
    redis.set(makeAlertSentKey(idempotencyKey), "1", { EX: ttlSeconds })
  );
}

/**
 * Email workspace admins once when an enabled workspace-pool trigger is blocked
 * by the programmatic monthly cap. Called from the trigger gates, after
 * `isTriggerProgrammaticCapReached` reported the block, through
 * `fireAndForgetNotification` so a failure is logged and never fails the run.
 *
 * The reason distinguishes a cap set to 0 (`programmatic_cap_disabled`, nothing
 * was consumed) from a positive cap that was used up
 * (`programmatic_cap_exhausted`). The idempotency key covers workspace, reason,
 * the cap value and, for a positive cap, the billing cycle, so unrelated
 * usage-configuration edits never re-arm the email. A sent marker
 * in Redis keeps repeated runs from calling Novu again; it is only written after
 * a successful send, and the Novu `transactionId` on the same key absorbs the
 * race between two concurrent runs.
 */
export async function notifyAdminsTriggerBlockedByProgrammaticCap(
  auth: Authenticator,
  { trigger }: { trigger: TriggerType }
): Promise<Result<void, DustError<"internal_error">>> {
  if (
    trigger.status !== "enabled" ||
    trigger.executionMode !== "workspace_pool" ||
    !isCreditPricedWorkspace(auth)
  ) {
    return new Ok(undefined);
  }

  const workspace = auth.getNonNullableWorkspace();
  if (!(await tryClaimAlertCheck(workspace.sId))) {
    return new Ok(undefined);
  }

  const configuration =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const monthlyCapCredits =
    configuration?.programmaticMonthlyCapAwuCredits ?? 0;
  const capVersion = `cap-${monthlyCapCredits}`;

  let reason: ProgrammaticCapBlockReason;
  let idempotencyKey: string;
  let ttlSeconds: number;
  if (monthlyCapCredits <= 0) {
    reason = "programmatic_cap_disabled";
    idempotencyKey = `${workspace.sId}-${reason}-${capVersion}`;
    ttlSeconds = DISABLED_CAP_ALERT_TTL_SECONDS;
  } else {
    // A positive cap can only be reached over a resolved billing cycle; without
    // one the block came from elsewhere (or a race), so stay quiet.
    const bounds = await resolveSpendLimitCycleBounds(workspace);
    if (!bounds) {
      return new Ok(undefined);
    }
    reason = "programmatic_cap_exhausted";
    idempotencyKey = `${workspace.sId}-${reason}-${bounds.label}-${capVersion}`;
    ttlSeconds = EXHAUSTED_CAP_ALERT_TTL_SECONDS;
  }

  if (await wasAlertSent(idempotencyKey)) {
    return new Ok(undefined);
  }

  const { members: admins } = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });
  if (admins.length === 0) {
    logger.warn(
      { workspaceId: workspace.sId, triggerId: trigger.sId, reason },
      "[ProgrammaticCapTriggerAlert] No active admins to notify"
    );
    return new Ok(undefined);
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      triggerId: trigger.sId,
      blockReason: PROGRAMMATIC_MONTHLY_CAP_BLOCK_REASON,
      reason,
      idempotencyKey,
    },
    "[ProgrammaticCapTriggerAlert] Notifying admins of blocked trigger"
  );

  const res = await triggerProgrammaticCapReachedNotifications(auth, {
    admins: admins.map((admin) => ({
      sId: admin.sId,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
    })),
    monthlyCapCredits,
    reason,
    idempotencyKey,
  });
  if (res.isErr()) {
    return res;
  }

  await markAlertSent(idempotencyKey, { ttlSeconds });

  return new Ok(undefined);
}
