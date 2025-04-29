import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { GroupAgentModel } from "@app/lib/models/assistant/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { LightAgentConfigurationType, LightWorkspaceType } from "@app/types";
import assert from "assert";
import { Logger } from "pino";

async function backfillAgentEditorsGroup(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  // find all editors of this agent
  const agentConfigs = await AgentConfiguration.findAll({
    where: {
      sId: agent.sId,
    },
  });

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
    logger.info("Multiple groups found for agent", agent);
    throw new Error("Multiple groups found for agent");
  }

  let editorGroup: GroupResource | null = null;

  if (groupSet.size === 1) {
    editorGroup = await GroupResource.fetchByModelId(
      groupAgentRelationships[0].groupId
    );
    assert(editorGroup, "Editor group not found");
  } else {
    // Create an editor group for the agent without author
    editorGroup = await GroupResource.makeNew({
      workspaceId: workspace.id,
      name: `Group for Agent ${agent.name}`,
      kind: "agent_editors",
    });
  }

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

  // set all the editors of the agent to the editor group
  const users = await UserResource.fetchByModelIds(editorIds);
  if (execute) {
    const result = await editorGroup.setMembers(
      auth,
      users.map((user) => user.toJSON())
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
  const agents = (
    await getAgentConfigurations({
      auth,
      agentsGetView: "admin_internal",
      variant: "light",
    })
  ).filter((agent) => agent.scope !== "global");

  if (agents.length === 0) {
    return;
  }

  logger.info(
    `Found ${agents.length} agents to migrate on workspace ${workspace.sId}`
  );

  if (!execute) {
    return;
  }

  await concurrentExecutor(
    agents,
    (agent) =>
      backfillAgentEditorsGroup(auth, agent, workspace, execute, logger),
    { concurrency: 1 }
  );

  logger.info(
    `Agent editors group backfill completed for workspace ${workspace.sId}`
  );
};

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting agent editors group backfill");

  await runOnAllWorkspaces(
    async (workspace) => {
      await migrateWorkspaceEditorsGroups(execute, logger, workspace);
    },
    { concurrency: 1 }
  );

  logger.info("Agent editors group backfill completed");
});
