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
  clearMetronomePerUserWarningAlert,
  getMetronomeDefaultUserCapAlertForSeatType,
  getMetronomePerUserCap,
  upsertMetronomePerUserCapAlert,
  upsertMetronomePerUserWarningAlert,
} from "@app/lib/metronome/alerts/spend_limits";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getAwuAllocationForSeatType,
  getProductSeatTypes,
} from "@app/lib/metronome/seat_types";
import { clearUserAwuWarned } from "@app/lib/metronome/user_block";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";
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

/**
 * Resolve the seat AWU allowance for a user based on their membership seat
 * type and the active contract. Returns 0 when the contract or seat type
 * can't be resolved (e.g. free seats, no contract).
 */
async function resolveUserSeatAllowance(
  auth: Authenticator,
  user: UserResource
): Promise<number> {
  const workspace = auth.getNonNullableWorkspace();
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  const normalizedSeatType = normalizeToPoolLimitSeatType(membership?.seatType);
  if (!normalizedSeatType) {
    return 0;
  }
  const contract = await getActiveContract(workspace.sId);
  if (!contract) {
    return 0;
  }
  const productSeatTypes = await getProductSeatTypes();
  return getAwuAllocationForSeatType(
    contract,
    normalizedSeatType,
    productSeatTypes
  );
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

  // The Metronome threshold includes the seat allowance. Subtract it to
  // return the pool-only portion (what the admin entered).
  const seatAllowance = await resolveUserSeatAllowance(auth, user);
  const poolAwuCredits = result.value.alert.threshold - seatAllowance;
  return new Ok({ kind: "limited", awuCredits: poolAwuCredits });
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

async function dispatchTransition({
  workspace,
  userId,
  transitionedTo,
}: {
  workspace: WorkspaceResource;
  userId: string;
  transitionedTo: "reached" | "resolved";
}): Promise<void> {
  const dispatchResult =
    transitionedTo === "reached"
      ? await dispatchPerUserCapReached({ workspace, userId })
      : await dispatchPerUserCapResolved({ workspace, userId });
  if (dispatchResult.isErr()) {
    logger.warn(
      {
        workspaceId: workspace.sId,
        userId,
        transitionedTo,
        err: dispatchResult.error,
      },
      "[Metronome PerUserCap] dispatch after spend-limit update failed; continuing"
    );
  }
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

      // Best-effort: also clear the companion 80% warning alert.
      const clearWarningResult = await clearMetronomePerUserWarningAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (clearWarningResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            err: clearWarningResult.error,
          },
          "[Metronome PerUserCap] Failed to clear warning alert; continuing"
        );
      }
      void clearUserAwuWarned(workspace.sId, user.sId);

      // Look up the user's seat type to find the matching default cap.
      const membership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace,
        });
      const normalizedSeatType = normalizeToPoolLimitSeatType(
        membership?.seatType
      );

      let defaultAlert = null;
      if (normalizedSeatType) {
        const defaultResult = await getMetronomeDefaultUserCapAlertForSeatType({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          seatType: normalizedSeatType,
        });
        if (defaultResult.isErr()) {
          return new Err(
            new UserSpendLimitError(
              "metronome_error",
              defaultResult.error.message
            )
          );
        }
        defaultAlert = defaultResult.value;
      }

      if (defaultAlert) {
        transitionedTo = await resolveLocalCapState({
          metronomeCustomerId: workspace.metronomeCustomerId,
          metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
          userId: user.sId,
          awuCapCredits: defaultAlert.alert.threshold,
        });
      } else {
        transitionedTo = "resolved";
      }

      if (transitionedTo !== null) {
        await dispatchTransition({
          workspace: workspaceResource,
          userId: user.sId,
          transitionedTo,
        });
      }
      // transitionedTo === null: usage unavailable — let webhook reconcile.
      break;
    }
    case "limited": {
      // The admin enters pool credits. Add the seat allowance to get the
      // total Metronome threshold.
      const seatAllowance = await resolveUserSeatAllowance(auth, user);
      const totalAwuCredits = limit.awuCredits + seatAllowance;

      const upsertResult = await upsertMetronomePerUserCapAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
        awuCredits: totalAwuCredits,
      });
      if (upsertResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            awuCredits: totalAwuCredits,
            seatAllowance,
            err: upsertResult.error,
          },
          "[Metronome PerUserCap] Failed to upsert per-user cap alert"
        );
        return new Err(
          new UserSpendLimitError("metronome_error", upsertResult.error.message)
        );
      }

      // Best-effort: also upsert the companion 80% warning alert.
      const upsertWarningResult = await upsertMetronomePerUserWarningAlert({
        metronomeCustomerId: workspace.metronomeCustomerId,
        workspaceId: workspace.sId,
        userId: user.sId,
        capAwuCredits: totalAwuCredits,
      });
      if (upsertWarningResult.isErr()) {
        logger.warn(
          {
            workspaceId: workspace.sId,
            userId: user.sId,
            awuCredits: totalAwuCredits,
            err: upsertWarningResult.error,
          },
          "[Metronome PerUserCap] Failed to upsert warning alert; continuing"
        );
      }

      transitionedTo = await resolveLocalCapState({
        metronomeCustomerId: workspace.metronomeCustomerId,
        metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
        userId: user.sId,
        awuCapCredits: totalAwuCredits,
      });
      if (transitionedTo !== null) {
        await dispatchTransition({
          workspace: workspaceResource,
          userId: user.sId,
          transitionedTo,
        });
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
