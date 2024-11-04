import assert from "assert";
import { isEqual } from "lodash";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import {
  getAgentConfigurationGroupIdsFromActions,
  getAgentConfigurationGroupIdsFromActionsLegacy,
  listAgentConfigurationsForGroups,
} from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import mainLogger from "@app/logger/logger";

export async function updateSpacePermissions({
  spaceId,
  workspaceId,
}: {
  spaceId: string;
  workspaceId: string;
}) {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    throw new Error("Space not found.");
  }

  assert(space.isRegular(), "Cannot update permissions for non-regular space.");

  const logger = mainLogger.child({ spaceId, workspaceId });

  // Fetch all regular groups of the space.
  const spaceRegularGroups = space.groups.filter((g) => g.isRegular());

  // Fetch all agent configurations that are using the regular groups of the space.
  const agentConfigurationsForRegularGroups =
    await listAgentConfigurationsForGroups(auth, spaceRegularGroups);

  if (agentConfigurationsForRegularGroups.length === 0) {
    logger.info(
      {},
      "[PermissionsQueue] No agent configurations found for regular groups."
    );
    return;
  }

  const agentConfigurationIds = agentConfigurationsForRegularGroups.map(
    (a) => a.sId
  );

  logger.info(
    {
      agentConfigurationIds,
    },
    "[PermissionsQueue] Agent configurations found for regular groups."
  );

  // Update the permissions of all the agent configurations.
  for (const acId of agentConfigurationIds) {
    const [ac] = await getAgentConfigurations({
      auth,
      agentsGetView: {
        agentIds: [acId],
      },
      variant: "full",
      dangerouslySkipPermissionFiltering: true,
    });
    if (!ac) {
      logger.warn(
        {
          agentConfigurationId: acId,
        },
        "[PermissionsQueue] Agent configuration not found."
      );
      continue;
    }

    // TODO(2024-11-04 flav) `groupId` clean-up.
    const groupIds = await getAgentConfigurationGroupIdsFromActionsLegacy(
      auth,
      ac.actions
    );

    const requestedGroupIds = await getAgentConfigurationGroupIdsFromActions(
      auth,
      ac.actions
    );

    const groupIdsToSIds = groupIds.map((gId) =>
      GroupResource.modelIdToSId({ id: gId, workspaceId: workspace.id })
    );

    if (isEqual(groupIdsToSIds.sort(), ac.groupIds.sort())) {
      continue;
    }

    await AgentConfiguration.update(
      {
        groupIds,
        requestedGroupIds,
      },
      {
        where: {
          sId: ac.sId,
        },
      }
    );
  }
}
