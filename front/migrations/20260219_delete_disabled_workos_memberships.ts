import type { OrganizationMembership } from "@workos-inc/node";

import { getWorkOS } from "@app/lib/api/workos/client";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

async function fetchDisabledMemberships(
  organizationId: string
): Promise<OrganizationMembership[]> {
  const workos = getWorkOS();
  const memberships: OrganizationMembership[] = [];

  while (true) {
    const page = await workos.userManagement.listOrganizationMemberships({
      organizationId,
      statuses: ["inactive"],
      limit: 100,
      after:
        memberships.length > 0
          ? memberships[memberships.length - 1].id
          : undefined,
    });

    memberships.push(...page.data);
    if (page.data.length < 100) {
      break;
    }
  }

  return memberships;
}

async function deleteDisabledMembershipsForWorkspace(
  workspace: LightWorkspaceType,
  logger: typeof Logger,
  execute: boolean
) {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  if (!workspace.workOSOrganizationId) {
    return;
  }

  const memberships = await fetchDisabledMemberships(
    workspace.workOSOrganizationId
  );

  if (memberships.length === 0) {
    return;
  }

  workspaceLogger.info(
    { count: memberships.length },
    "Found disabled WorkOS memberships"
  );

  for (const membership of memberships) {
    workspaceLogger.info(
      {
        membershipId: membership.id,
        userId: membership.userId,
        status: membership.status,
      },
      execute
        ? "Deleting disabled WorkOS membership"
        : "Dry run: would delete disabled WorkOS membership"
    );
  }

  if (execute) {
    await concurrentExecutor(
      memberships,
      async (membership) => {
        await getWorkOS().userManagement.deleteOrganizationMembership(
          membership.id
        );
      },
      { concurrency: 10 }
    );

    workspaceLogger.info(
      { count: memberships.length },
      "Deleted disabled WorkOS memberships"
    );
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      alias: "w",
      description:
        "Workspace sId (optional, if not provided will run on all workspaces)",
      demandOption: false,
    },
  },
  async ({ workspaceId, execute }, scriptLogger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await deleteDisabledMembershipsForWorkspace(
        renderLightWorkspaceType({ workspace }),
        scriptLogger,
        execute
      );
    } else {
      await runOnAllWorkspaces(
        (workspace) =>
          deleteDisabledMembershipsForWorkspace(
            workspace,
            scriptLogger,
            execute
          ),
        { concurrency: 5 }
      );
    }

    scriptLogger.info("Done");
  }
);
