/**
 * For every active subscription on the legacy PRO_PLAN_SEAT_39 plan, check whether the
 * workspace has an active WorkOS SSO connection configured. If it does, set the
 * `isSSOAllowed` plan-limit override so the workspace keeps access to its SSO settings
 * even though the plan itself does not grant `isSSOAllowed`.
 *
 * A workspace that already has an explicit `isSSOAllowed` override is left alone, in
 * either direction: `false` is a deliberate deny, not a missing value.
 *
 * Dry run by default. Run with:
 *   npx tsx scripts/enable_allow_sso_for_pro_plan_seat_39.ts [--concurrency 4] [--execute]
 */

import {
  getWorkspacePlanLimitOverrides,
  setWorkspacePlanLimitOverrides,
} from "@app/lib/api/plan_limit_overrides";
import { getWorkOSOrganizationSSOConnections } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import { PRO_PLAN_SEAT_39_CODE } from "@app/lib/plans/plan_codes";
import { EMPTY_PLAN_LIMIT_OVERRIDE } from "@app/lib/plans/plan_limit_overrides";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";

async function processWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  if (!workspace.workOSOrganizationId) {
    logger.info(
      { workspaceId: workspace.sId },
      "No WorkOS organization, skipping."
    );
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existingOverride = await getWorkspacePlanLimitOverrides(auth);
  if (existingOverride?.isSSOAllowed != null) {
    logger.info(
      {
        workspaceId: workspace.sId,
        isSSOAllowed: existingOverride.isSSOAllowed,
      },
      "isSSOAllowed override already set, skipping."
    );
    return;
  }

  const connectionsResult = await getWorkOSOrganizationSSOConnections({
    workspace,
  });
  if (connectionsResult.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        error: normalizeError(connectionsResult.error).message,
      },
      "Failed to list SSO connections."
    );
    return;
  }

  const isSSOConfigured = connectionsResult.value.some(
    (connection) => connection.state === "active"
  );
  if (!isSSOConfigured) {
    logger.info({ workspaceId: workspace.sId }, "SSO not enabled, skipping.");
    return;
  }

  logger.info(
    { workspaceId: workspace.sId },
    execute
      ? "Setting isSSOAllowed override."
      : "Would set isSSOAllowed override."
  );

  if (execute) {
    // The override row holds every overridable limit at once, so the existing
    // values have to be carried over — a bare `isSSOAllowed` would clear any
    // negotiated seat or space override this workspace already has.
    const res = await setWorkspacePlanLimitOverrides(auth, {
      ...(existingOverride ?? EMPTY_PLAN_LIMIT_OVERRIDE),
      isSSOAllowed: true,
    });
    if (res.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, error: res.error.message },
        "Failed to set isSSOAllowed override."
      );
    }
  }
}

makeScript(
  {
    concurrency: {
      type: "number" as const,
      description: "Number of workspaces to process in parallel",
      default: 4,
    },
  },
  async ({ concurrency, execute }, logger) => {
    const subscriptions =
      await SubscriptionResource.internalListAllActiveNoFreeTestPlan();
    const proPlanSeat39Subscriptions = subscriptions.filter(
      (s) => s.getPlan().code === PRO_PLAN_SEAT_39_CODE
    );

    const workspaceModelIds = [
      ...new Set(proPlanSeat39Subscriptions.map((s) => s.workspaceId)),
    ];
    const workspaceResources =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    const workspaces = workspaceResources.map((w) =>
      renderLightWorkspaceType({ workspace: w })
    );

    logger.info(
      { candidates: workspaces.length },
      `${execute ? "Executing" : "[DRY RUN]"} over ${workspaces.length} candidate workspace(s) on ${PRO_PLAN_SEAT_39_CODE}`
    );

    await concurrentExecutor(
      workspaces,
      async (workspace) => {
        try {
          await processWorkspace(workspace, execute, logger);
        } catch (err) {
          logger.error(
            { workspaceId: workspace.sId, error: normalizeError(err).message },
            "Unexpected error while processing workspace."
          );
        }
      },
      { concurrency }
    );
  }
);
