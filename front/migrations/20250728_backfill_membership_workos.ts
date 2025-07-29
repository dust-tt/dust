import { getWorkOS } from "@app/lib/api/workos/client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

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

  const m = await getWorkOS().userManagement.listOrganizationMemberships({
    organizationId: workspace.workOSOrganizationId,
    statuses: ["active"],
  });
  const workspaceWorkOSId = workspace.workOSOrganizationId;

  for (const membership of memberships) {
    const user = membership.user;
    if (!user || !user.workOSUserId) {
      continue;
    }

    if (m.data.some((mem) => mem.userId === user.workOSUserId)) {
      workspaceLogger.info(
        `User ${user.email} already has WorkOS membership for workspace ${workspace.sId} - ${workspace.name}`
      );
      continue;
    }

    if (execute) {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          await getWorkOS().userManagement.createOrganizationMembership({
            userId: user.workOSUserId,
            organizationId: workspaceWorkOSId,
          });

          workspaceLogger.info(
            `Set WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name}`
          );
          break;
        } catch (error: any) {
          if (error?.status === 429) {
            retryCount++;
            const retryAfterSeconds = error.retryAfter || 10;
            const retryAfterMs = retryAfterSeconds * 1000;

            workspaceLogger.warn(
              `Rate limited (429) creating WorkOS membership for user ${user.email}, waiting ${retryAfterSeconds}s before retry ${retryCount}/${maxRetries}`
            );

            if (retryCount < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
            } else {
              workspaceLogger.error(
                `Failed to create WorkOS membership for user ${user.email} after ${maxRetries} retries due to rate limiting`
              );
              throw error;
            }
          } else {
            workspaceLogger.error(
              `Error creating WorkOS membership for user ${user.email}:`,
              error
            );
            throw error;
          }
        }
      }
    } else {
      workspaceLogger.info(
        `Would set WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name}`
      );
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting WorkOS membership backfill across all workspaces");

  await runOnAllWorkspaces(
    async (workspace) =>
      updateMembershipOriginsForWorkspace(workspace, logger, execute),
    { concurrency: 1 }
  );

  logger.info("Completed WorkOS membership backfill");
});
