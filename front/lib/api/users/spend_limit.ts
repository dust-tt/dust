import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import {
  dispatchPerUserCapReached,
  dispatchPerUserCapResolved,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  clearMetronomePerUserCapAlert,
  getMetronomePerUserCap,
  syncMetronomePerUserCapAlert,
} from "@app/lib/metronome/per_user_alerts";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const MIN_USER_SPEND_LIMIT_AWU_CREDITS = 1;
export const MAX_USER_SPEND_LIMIT_AWU_CREDITS = 1_000_000;

export type UserSpendLimit =
  | { kind: "unlimited" }
  | { kind: "limited"; awuCredits: number };

export type GetUserSpendLimitResponse = UserSpendLimit;

export type SetUserSpendLimitResponse = {
  limit: UserSpendLimit;
  // The credit-state we transitioned the user to, computed locally from
  // current pool consumption. `null` when usage couldn't be determined and
  // we therefore did not dispatch a transition (the Metronome webhook
  // will reconcile on the next state change).
  transitionedTo: "reached" | "resolved" | null;
};

export type UserSpendLimitErrorType =
  | "user_not_found"
  | "workspace_not_metronome_billed"
  | "metronome_error";

export class UserSpendLimitError extends Error {
  constructor(
    readonly type: UserSpendLimitErrorType,
    message: string
  ) {
    super(message);
  }
}

export async function getUserSpendLimit(
  auth: Authenticator,
  { userId }: { userId: string }
): Promise<Result<GetUserSpendLimitResponse, UserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find the user in this workspace."
      )
    );
  }

  const result = await getMetronomePerUserCap({
    metronomeCustomerId: workspace.metronomeCustomerId,
    workspaceId: workspace.sId,
    userId: user.sId,
  });
  if (result.isErr()) {
    return new Err(
      new UserSpendLimitError("metronome_error", result.error.message)
    );
  }

  if (!result.value) {
    return new Ok({ kind: "unlimited" });
  }
  return new Ok({ kind: "limited", awuCredits: result.value.threshold });
}

/**
 * Resolve the credit state for a user given a freshly applied cap, by
 * comparing the user's current pool consumption to the cap. The Metronome
 * alert we just created/cleared remains the source of truth for *future*
 * crossings (the webhook keeps the state in sync); this local comparison
 * just sets the immediate state without depending on Metronome's eventual-
 * consistent alert evaluation (which can sit in `evaluating` for minutes).
 *
 * Returns `null` if usage couldn't be fetched — caller should not dispatch
 * and let the webhook reconcile.
 */
async function resolveLocalCapState({
  metronomeCustomerId,
  metronomeContractId,
  userId,
  awuCapCredits,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string | null;
  userId: string;
  awuCapCredits: number;
}): Promise<"reached" | "resolved" | null> {
  if (!metronomeContractId) {
    return null;
  }
  const usageResult = await fetchPerUserAwuUsage({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (usageResult.isErr()) {
    logger.warn(
      {
        metronomeCustomerId,
        userId: userId,
        err: usageResult.error,
      },
      "[Metronome PerUserCap] Could not fetch current usage; skipping immediate state dispatch"
    );
    return null;
  }
  const consumed = usageResult.value.get(userId) ?? 0;
  return consumed >= awuCapCredits ? "reached" : "resolved";
}

export async function setUserSpendLimit(
  auth: Authenticator,
  {
    userId,
    limit,
    auditContext,
  }: {
    userId: string;
    limit: UserSpendLimit;
    auditContext: AuditLogContext;
  }
): Promise<Result<SetUserSpendLimitResponse, UserSpendLimitError>> {
  const workspace = auth.getNonNullableWorkspace();
  if (!workspace.metronomeCustomerId) {
    return new Err(
      new UserSpendLimitError(
        "workspace_not_metronome_billed",
        "Workspace is not on Metronome billing."
      )
    );
  }

  const user = await getUserForWorkspace(auth, { userId });
  if (!user) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not find the user in this workspace."
      )
    );
  }

  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource) {
    return new Err(
      new UserSpendLimitError(
        "user_not_found",
        "Could not load workspace resource."
      )
    );
  }

  let transitionedTo: "reached" | "resolved" | null;

  switch (limit.kind) {
    case "unlimited": {
      const clearResult = await clearMetronomePerUserCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (clearResult.isErr()) {
        return new Err(
          new UserSpendLimitError("metronome_error", clearResult.error.message)
        );
      }
      try {
        await dispatchPerUserCapResolved({
          workspace: workspaceResource,
          userId: user.sId,
        });
      } catch (error) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            err: error,
          },
          "[Metronome PerUserCap] dispatchPerUserCapResolved failed after spend-limit update; continuing"
        );
      }
      transitionedTo = "resolved";
      break;
    }
    case "limited": {
      const syncResult = await syncMetronomePerUserCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
        awuCredits: limit.awuCredits,
      });
      if (syncResult.isErr()) {
        return new Err(
          new UserSpendLimitError("metronome_error", syncResult.error.message)
        );
      }
      transitionedTo = await resolveLocalCapState({
        metronomeCustomerId: workspace.metronomeCustomerId,
        metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
        userId: user.sId,
        awuCapCredits: limit.awuCredits,
      });
      try {
        if (transitionedTo === "reached") {
          await dispatchPerUserCapReached({
            workspace: workspaceResource,
            userId: user.sId,
          });
        } else if (transitionedTo === "resolved") {
          await dispatchPerUserCapResolved({
            workspace: workspaceResource,
            userId: user.sId,
          });
        }
      } catch (error) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            transitionedTo,
            err: error,
          },
          "[Metronome PerUserCap] dispatch after spend-limit update failed; continuing"
        );
      }
      // transitionedTo === null: usage unavailable — let webhook reconcile.
      break;
    }
    default:
      assertNever(limit);
  }

  void emitAuditLogEvent({
    auth,
    action: "member.spend_limit_updated",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: auditContext,
    metadata: {
      kind: limit.kind,
      awu_credits:
        limit.kind === "limited" ? String(limit.awuCredits) : "unlimited",
    },
  });

  return new Ok({ limit, transitionedTo });
}
