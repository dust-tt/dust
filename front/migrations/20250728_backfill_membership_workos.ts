import { getWorkOS } from "@app/lib/api/workos/client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const WORKSPACE_CONCURRENCY = 5;
const MEMBERSHIP_CONCURRENCY = 10;

async function updateMembershipOriginsForWorkspace(
  workspace: LightWorkspaceType,
  logger: typeof Logger,
  execute: boolean
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  workspaceLogger.info("Starting WorkOS membership backfill for workspace");

  if (!workspace.workOSOrganizationId) {
    workspaceLogger.info("Workspace has no WorkOS organization ID, skipping");
    return;
  }

  const { memberships } = await MembershipResource.getMembershipsForWorkspace({
    workspace,
    includeUser: true,
  });

  await concurrentExecutor(
    memberships,
    async (membership) => {
      const user = membership.user;
      if (!user || !user.workOSUserId) {
        return;
      }

      if (execute) {
        if (!workspace.workOSOrganizationId) {
          return;
        }

        const m = await getWorkOS().userManagement.listOrganizationMemberships({
          organizationId: workspace.workOSOrganizationId,
          userId: user.workOSUserId,
          statuses: ["active"],
        });

        if (m.data.length > 0) {
          workspaceLogger.info(
            `User ${user.email} already has WorkOS membership for workspace ${workspace.sId} - ${workspace.name}`
          );
          return;
        }

        await getWorkOS().userManagement.createOrganizationMembership({
          userId: user.workOSUserId,
          organizationId: workspace.workOSOrganizationId,
        });
        workspaceLogger.info(
          `Set WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name}`
        );
      } else {
        workspaceLogger.info(
          `Would set WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name}`
        );
      }
    },
    { concurrency: MEMBERSHIP_CONCURRENCY }
  );
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting WorkOS membership backfill across all workspaces");

  await runOnAllWorkspaces(
    async (workspace) =>
      updateMembershipOriginsForWorkspace(workspace, logger, execute),
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  logger.info("Completed WorkOS membership backfill");
});
