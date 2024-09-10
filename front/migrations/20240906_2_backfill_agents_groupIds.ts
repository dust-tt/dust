import _ from "lodash";
import { Sequelize } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { Logger } from "@app/logger/logger";
import { getDataSourceViewIdsFromActions } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // All workspaces that have at least one agent
  const workspaceIds = await getDistinctWorkspaceIds();

  const workspaceChunks = _.chunk(workspaceIds, 8);

  for (const workspaceChunk of workspaceChunks) {
    await Promise.all(
      workspaceChunk.map((id) => updateAgentsForWorkspace(id, execute, logger))
    );
  }
});

async function getDistinctWorkspaceIds(): Promise<number[]> {
  const workspaceIds = await AgentConfiguration.findAll({
    attributes: [
      [Sequelize.fn("DISTINCT", Sequelize.col("workspaceId")), "workspaceId"],
    ],
    raw: true,
  });

  return workspaceIds.map((entry) => entry.workspaceId);
}

async function updateAgentsForWorkspace(
  workspaceId: number,
  execute: boolean,
  logger: Logger
) {
  const allAgents = await AgentConfiguration.findAll({
    attributes: ["sId", "groupIds"],
    where: { workspaceId, status: "active" },
  });

  // no need to update agents that already have groupIds
  const agents = allAgents.filter(
    (agent) => !agent.groupIds || agent.groupIds.length === 0
  );

  logger.info(
    { workspaceId, count: agents.length },
    "Updating agents for workspace"
  );

  const agentChunks = _.chunk(agents, 16);

  // get workspace sid
  const workspace = await Workspace.findByPk(workspaceId);

  if (!workspace) {
    logger.error(
      {
        workspaceId,
      },
      "Unexpected: Workspace not found"
    );
    return;
  }

  for (const agentChunk of agentChunks) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await Promise.all(
      agentChunk.map((agent) => updateAgent(auth, agent, execute, logger))
    );
  }
}

async function updateAgent(
  auth: Authenticator,
  agent: AgentConfiguration,
  execute: boolean,
  logger: Logger
) {
  const assistant = await getAgentConfiguration(auth, agent.sId);
  if (!assistant) {
    logger.error(
      {
        agentId: agent.sId,
      },
      "Unexpected: Agent not found"
    );
    return;
  }

  const dataSourceViewIds = getDataSourceViewIdsFromActions(assistant.actions);

  const groupIds = (
    await DataSourceViewResource.fetchByIds(auth, dataSourceViewIds)
  )
    .map((view) => view.acl().aclEntries.map((entry) => entry.groupId))
    .flat();

  if (execute) {
    await AgentConfiguration.update(
      { groupIds },
      { where: { sId: agent.sId } }
    );
    logger.info(
      {
        agentId: agent.sId,
        execute,
      },
      "Updated agent"
    );
  } else {
    logger.info(
      {
        agentId: agent.sId,
        execute,
      },
      "Would have updated agent"
    );
  }
}
