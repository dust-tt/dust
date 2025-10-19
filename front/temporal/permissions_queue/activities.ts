import assert from "assert";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import {
  getAgentConfigurationRequirementsFromActions,
  listAgentConfigurationsForGroups,
} from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { isArrayEqual2DUnordered, normalizeArrays } from "@app/lib/utils";
import mainLogger from "@app/logger/logger";

// TODO(2025-10-17 thomas): Remove this
export async function updateSpacePermissions({
  spaceId,
  workspaceId,
}: {
  spaceId: string;
  workspaceId: string;
}) {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const logger = mainLogger.child({ spaceId, workspaceId });

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    logger.info("Space not found, cancelling activity.");
    return;
  }

  assert(space.isRegular(), "Cannot update permissions for non-regular space.");

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
    const acList = await getAgentConfigurations(auth, {
      agentIds: [acId],
      variant: "full",
    });
    const [ac] = acList;
    if (!ac) {
      logger.warn(
        {
          agentConfigurationId: acId,
        },
        "[PermissionsQueue] Agent configuration not found."
      );
      continue;
    }

    const requirements = await getAgentConfigurationRequirementsFromActions(
      auth,
      { actions: ac.actions }
    );

    const requestedGroupIdsToSIds = requirements.requestedGroupIds.map((gs) =>
      gs.map((gId) =>
        GroupResource.modelIdToSId({ id: gId, workspaceId: workspace.id })
      )
    );

    if (
      isArrayEqual2DUnordered(requestedGroupIdsToSIds, ac.requestedGroupIds)
    ) {
      continue;
    }

    await AgentConfiguration.update(
      {
        requestedGroupIds: normalizeArrays(requirements.requestedGroupIds),
      },
      {
        where: {
          sId: ac.sId,
        },
      }
    );
  }
}
