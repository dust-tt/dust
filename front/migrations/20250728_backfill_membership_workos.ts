import type { OrganizationMembership } from "@workos-inc/node";

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

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });

  let workOSMemberships: OrganizationMembership[] = [];
  while (true) {
    const curr = await getWorkOS().userManagement.listOrganizationMemberships({
      organizationId: workspace.workOSOrganizationId,
      statuses: ["active"],
      limit: 100,
      after:
        workOSMemberships.length > 0
          ? workOSMemberships[workOSMemberships.length - 1].id
          : undefined,
    });

    logger.info(
      "Fetched %d active WorkOS memberships for workspace %s",
      curr.data.length,
      workspace.sId
    );

    workOSMemberships = workOSMemberships.concat(curr.data);
    if (curr.data.length < 100) {
      break;
    }
  }

  logger.info(
    "Found %d active WorkOS memberships for workspace %s",
    workOSMemberships.length,
    workspace.sId
  );

  const workspaceWorkOSId = workspace.workOSOrganizationId;

  for (const membership of memberships) {
    const user = membership.user;
    if (!user || !user.workOSUserId) {
      continue;
    }

    const existingMembership = workOSMemberships.find(
      (mem) => mem.userId === user.workOSUserId
    );
    if (
      existingMembership &&
      existingMembership.role.slug === membership.role
    ) {
      workspaceLogger.info(
        `User ${user.email} already has WorkOS membership for workspace ${workspace.sId} - ${workspace.name} with role ${membership.role}`
      );

      continue;
    }

    if (execute) {
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          if (existingMembership) {
            await getWorkOS().userManagement.updateOrganizationMembership(
              existingMembership.id,
              {
                roleSlug: membership.role,
              }
            );

            workspaceLogger.info(
              `Updated WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name} with role ${membership.role}`
            );
          } else {
            await getWorkOS().userManagement.createOrganizationMembership({
              userId: user.workOSUserId,
              organizationId: workspaceWorkOSId,
              roleSlug: membership.role,
            });

            workspaceLogger.info(
              `Created WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name} with role ${membership.role}`
            );
          }

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
              `SKIPPING - Error creating WorkOS membership for user ${user.email}:`,
              error
            );
            break;
          }
        }
      }
    } else {
      workspaceLogger.info(
        `Would set WorkOS membership for user ${user.email} for workspace ${workspace.sId} - ${workspace.name} with role ${membership.role}`
      );
    }
  }
  for (const workOSMembership of workOSMemberships) {
    if (
      workOSMembership.status !== "active" ||
      workOSMembership.role.slug === "member"
    ) {
      // Ignore inactive memberships and members
      continue;
    }

    const existingMembership = memberships.find(
      (m) => m.user?.workOSUserId === workOSMembership.userId
    );
    if (!existingMembership) {
      if (execute) {
        await getWorkOS().userManagement.deleteOrganizationMembership(
          workOSMembership.id
        );
        workspaceLogger.info(
          `Deleted WorkOS membership for user ${workOSMembership.userId} for workspace ${workspace.sId} - ${workspace.name}`
        );
      } else {
        workspaceLogger.info(
          `Would delete WorkOS membership for user ${workOSMembership.userId} for workspace ${workspace.sId} - ${workspace.name}`
        );
      }
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
