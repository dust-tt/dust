import assert from "assert";
import _ from "lodash";
import type { Logger } from "pino";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { AGENT_GROUP_PREFIX } from "@app/types";

async function backfillAgentEditorsGroup(
  auth: Authenticator,
  agentConfigs: AgentConfigurationModel[],
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info({ agent: agentConfigs[0].sId }, "Migrating agent");

  const editorIds = [
    ...new Set(agentConfigs.map((agentConfig) => agentConfig.authorId)),
  ];

  // check all groups for this sId, there should be max 1
  const groupAgentRelationships = await GroupAgentModel.findAll({
    where: {
      agentConfigurationId: agentConfigs.map((config) => config.id),
      workspaceId: workspace.id,
    },
    attributes: ["groupId", "agentConfigurationId"],
  });

  const groupSet = new Set(
    groupAgentRelationships.map((relationship) => relationship.groupId)
  );

  if (groupSet.size > 1) {
    logger.info(
      { agent: agentConfigs[0].sId },
      "Multiple groups found for agent"
    );
    throw new Error("Multiple groups found for agent");
  }

  let editorGroup: GroupResource | null = null;

  if (groupSet.size === 1) {
    editorGroup = await GroupResource.fetchByModelId(
      groupAgentRelationships[0].groupId
    );
    assert(editorGroup, "Editor group not found");
    // if group is not of kind agent_editors, update it
    if (editorGroup.kind !== "agent_editors") {
      logger.info(
        { agent: agentConfigs[0].sId },
        "Updating group kind for agent"
      );
      const groupModel = await GroupModel.findByPk(editorGroup.id);
      assert(groupModel, "Group model not found");
      if (execute) {
        await groupModel.update({
          kind: "agent_editors",
        });
      }
    }
  } else {
    logger.info(
      { agent: agentConfigs[0].sId },
      `Creating editor group for agent : Group for Agent ${agentConfigs[0].name}`
    );

    if (execute) {
      // Create an editor group for the agent without author
      editorGroup = await GroupResource.makeNew({
        workspaceId: workspace.id,
        name: `${AGENT_GROUP_PREFIX} ${agentConfigs[0].name} (${agentConfigs[0].sId})`,
        kind: "agent_editors",
      });
    }
  }

  if (execute && editorGroup) {
    // Associate the group with all agent configurations that don't yet have the
    // association
    await GroupAgentModel.bulkCreate(
      agentConfigs
        .filter(
          (config) =>
            !groupAgentRelationships.some(
              (relationship) => relationship.agentConfigurationId === config.id
            )
        )
        .map((config) => ({
          groupId: editorGroup.id,
          agentConfigurationId: config.id,
          workspaceId: workspace.id,
        }))
    );
  }

  // set all the editors of the agent to the editor group
  const users = await UserResource.fetchByModelIds(editorIds);
  // filter out users that aren't part of the workspace
  const memberships = await MembershipResource.getActiveMemberships({
    users,
    workspace,
  });

  const usersToAdd = users.filter((user) =>
    memberships.memberships.some((membership) => membership.userId === user.id)
  );

  logger.info(
    { agent: agentConfigs[0].sId, usersToAdd: usersToAdd.length },
    "Adding users to editor group"
  );

  if (execute && editorGroup) {
    const result = await editorGroup.setMembers(
      auth,
      usersToAdd.map((user) => user.toJSON())
    );

    if (result.isErr()) {
      throw result.error;
    }
  }
}

const migrateWorkspaceEditorsGroups = async (
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const agents = await (async () => {
    try {
      return await AgentConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          status: {
            [Op.not]: "draft",
          },
        },
      });
    } catch (error) {
      logger.error(
        {
          error,
          workspace,
        },
        "Error getting agent configurations"
      );
      return [];
    }
  })();

  if (agents.length === 0) {
    return;
  }

  const groupedAgentsMap = _.groupBy(agents, "sId");

  const groupedAgents = Object.values(groupedAgentsMap);

  logger.info(
    `Found ${groupedAgents.length} agents to migrate on workspace ${workspace.sId}`
  );

  await concurrentExecutor(
    groupedAgents,
    (agentConfigs) =>
      backfillAgentEditorsGroup(auth, agentConfigs, workspace, execute, logger),
    { concurrency: 4 }
  );

  logger.info(
    `Agent editors group backfill completed for workspace ${workspace.sId}`
  );
};

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting agent editors group backfill");

    if (wId) {
      const ws = await WorkspaceModel.findOne({ where: { sId: wId } });
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await migrateWorkspaceEditorsGroups(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await migrateWorkspaceEditorsGroups(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Agents migration completed");
  }
);
