import { Op } from "sequelize";

import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const WORKSPACE_CONCURRENCY = 5;
const MEMBERSHIP_CONCURRENCY = 10;

async function updateMembershipOriginsForWorkspace(
  workspace: LightWorkspaceType,
  logger: typeof Logger,
  execute: boolean
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  workspaceLogger.info("Starting membership origin update for workspace");

  // Find all consumed invitations for this workspace.
  const consumedInvitations = await MembershipInvitationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "consumed",
      invitedUserId: {
        [Op.not]: null,
      },
    },
  });

  workspaceLogger.info(
    `Found ${consumedInvitations.length} consumed invitations`
  );

  const invitedUserIds = new Set(
    consumedInvitations.map((inv) => inv.invitedUserId).filter(Boolean)
  );

  workspaceLogger.info(`Found ${invitedUserIds.size} unique invited users`);

  // Get all memberships for this workspace.
  const { memberships } = await MembershipResource.getMembershipsForWorkspace({
    workspace,
  });

  workspaceLogger.info(`Found ${memberships.length} total memberships`);

  await concurrentExecutor(
    memberships,
    async (membership) => {
      const origin = invitedUserIds.has(membership.userId)
        ? "invited"
        : "auto-joined";

      if (execute) {
        // "invited" is the default value.
        if (origin !== "invited") {
          await membership.model.update(
            { origin },
            { where: { id: membership.id } }
          );
        }
        workspaceLogger.info(
          `Set membership ${membership.id} (user ${membership.userId}) origin to: ${origin}`
        );
      } else {
        workspaceLogger.info(
          `Would set membership ${membership.id} (user ${membership.userId}) origin to: ${origin}`
        );
      }
    },
    { concurrency: MEMBERSHIP_CONCURRENCY }
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    "Starting membership origin identification across all workspaces"
  );

  await runOnAllWorkspaces(
    async (workspace) =>
      updateMembershipOriginsForWorkspace(workspace, logger, execute),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  logger.info("Completed membership origin identification");
});
