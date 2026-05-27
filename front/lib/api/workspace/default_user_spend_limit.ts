import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  getMetronomeDefaultUserCapAlert,
  upsertMetronomeDefaultUserCapAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS = 1000;
export const MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

export type DefaultUserSpendLimit = {
  awuCredits: number;
};

export type DefaultUserSpendLimitErrorType =
  | "workspace_not_metronome_billed"
  | "metronome_error"
  | "not_found"
  | "invalid_threshold";

export class DefaultUserSpendLimitError extends Error {
  constructor(
    readonly type: DefaultUserSpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

export async function getDefaultUserSpendLimit(
  auth: Authenticator
): Promise<Result<DefaultUserSpendLimit, DefaultUserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const result = await getMetronomeDefaultUserCapAlert({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  if (result.isErr()) {
    return new Err(
      new DefaultUserSpendLimitError("metronome_error", result.error.message)
    );
  }
  if (!result.value) {
    return new Err(
      new DefaultUserSpendLimitError(
        "not_found",
        "No default per-user spend limit configured for this workspace."
      )
    );
  }
  return new Ok({ awuCredits: result.value.alert.threshold });
}

/**
 * Update the workspace-wide default per-user spend limit.
 *
 * Per-user state transitions are NOT dispatched eagerly here: that would be
 * O(members) work and adds little value for a policy change. The Metronome
 * webhook handler fans out `reached` / `resolved` events as users cross
 * the new threshold, and `process_webhook.ts` re-derives effective state
 * (override > default > uncapped) on every per-user event — so the right
 * state lands per user once Metronome has finished evaluating.
 */
export async function setDefaultUserSpendLimit(
  auth: Authenticator,
  {
    awuCredits,
    auditContext,
  }: {
    awuCredits: number;
    auditContext: AuditLogContext;
  }
): Promise<Result<DefaultUserSpendLimit, DefaultUserSpendLimitError>> {
  if (
    !Number.isInteger(awuCredits) ||
    awuCredits < MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
    awuCredits > MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS
  ) {
    return new Err(
      new DefaultUserSpendLimitError(
        "invalid_threshold",
        `awuCredits must be an integer between ${MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS} and ${MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS}.`
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new DefaultUserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }
  const { metronomeCustomerId } = workspace;

  // Read previous threshold for audit metadata. Best-effort: if the lookup
  // fails or no alert exists yet, we still proceed with the upsert.
  const previousResult = await getMetronomeDefaultUserCapAlert({
    metronomeCustomerId,
    workspaceId: workspace.sId,
  });
  const previousAwuCredits = previousResult.isOk()
    ? (previousResult.value?.alert.threshold ?? null)
    : null;

  const upsertResult = await upsertMetronomeDefaultUserCapAlert({
    metronomeCustomerId,
    workspaceId: workspace.sId,
    awuCredits,
  });
  if (upsertResult.isErr()) {
    return new Err(
      new DefaultUserSpendLimitError(
        "metronome_error",
        upsertResult.error.message
      )
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "workspace.default_user_spend_limit_updated",
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: auditContext,
    metadata: {
      previous_awu_credits:
        previousAwuCredits !== null ? String(previousAwuCredits) : "unset",
      new_awu_credits: String(awuCredits),
    },
  });

  return new Ok({ awuCredits });
}
