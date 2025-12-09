import _ from "lodash";
import type { Logger } from "pino";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

async function backfillMissingEditorGroupForAgent(
  auth: Authenticator,
  agentConfigs: AgentConfigurationModel[],
  currentConfig: AgentConfigurationModel,
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  logger.info(
    { agent: currentConfig.sId, version: currentConfig.version },
    "Processing agent for missing editor group backfill"
  );

  const groupAgentRelationships = await GroupAgentModel.findAll({
    where: {
      agentConfigurationId: agentConfigs.map((config) => config.id),
      workspaceId: workspace.id,
    },
    attributes: ["groupId", "agentConfigurationId"],
  });

  if (groupAgentRelationships.length === 0) {
    logger.info(
      { agent: currentConfig.sId },
      "No preexisting editor group found for agent; skipping"
    );
    return;
  }

  const groupIds = Array.from(
    new Set(groupAgentRelationships.map((relationship) => relationship.groupId))
  );

  const hasActiveAssociation = groupAgentRelationships.some(
    (relationship) =>
      relationship.agentConfigurationId === currentConfig.id &&
      relationship.groupId === groupIds[0]
  );

  if (hasActiveAssociation) {
    logger.info(
      { agent: currentConfig.sId },
      "Active agent configuration already linked to editor group; skipping"
    );
    return;
  }

  // Among all groups associated with any non-draft version, prefer the editor
  // group linked to the highest version.
  const agentConfigsById = _.keyBy(agentConfigs, "id");

  const candidateGroup = groupAgentRelationships
    .map((relationship) => {
      const config = agentConfigsById[relationship.agentConfigurationId];
      return config
        ? {
            groupId: relationship.groupId,
            configVersion: config.version,
          }
        : null;
    })
    .filter((v): v is { groupId: number; configVersion: number } => v !== null)
    .reduce<{
      groupId: number;
      configVersion: number;
    } | null>((best, current) => {
      if (!best || current.configVersion > best.configVersion) {
        return current;
      }
      return best;
    }, null);

  if (!candidateGroup) {
    logger.info(
      { agent: currentConfig.sId },
      "No suitable preexisting editor group candidate found; skipping"
    );
    return;
  }

  const editorGroup = await GroupResource.fetchByModelId(
    candidateGroup.groupId
  );

  if (!editorGroup) {
    logger.warn(
      { agent: currentConfig.sId, groupId: candidateGroup.groupId },
      "Preexisting group referenced by versions not found; skipping"
    );
    return;
  }

  if (execute) {
    const result = await editorGroup.addGroupToAgentConfiguration({
      auth,
      agentConfiguration: currentConfig,
    });

    if (result.isErr()) {
      logger.error(
        {
          agent: currentConfig.sId,
          groupId: editorGroup.id,
          agentConfigurationId: currentConfig.id,
          error: result.error,
        },
        "Failed to link editor group to active agent configuration"
      );
      throw result.error;
    }

    logger.info(
      {
        agent: currentConfig.sId,
        groupId: editorGroup.id,
        agentConfigurationId: currentConfig.id,
      },
      "Linked preexisting editor group to active agent configuration"
    );
  } else {
    logger.info(
      {
        agent: currentConfig.sId,
        groupId: editorGroup.id,
        agentConfigurationId: currentConfig.id,
      },
      "Dry-run: would link editor group to active agent configuration"
    );
  }
}

const migrateWorkspaceMissingEditorGroups = async (
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // First, find active agent configurations that currently have no editor group associated.
  const activeAgents = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
    },
    include: [
      {
        model: GroupAgentModel,
        as: "agentGroupLinks",
        required: false,
        attributes: ["groupId"],
      },
    ],
  });

  const activeAgentsWithoutGroup = activeAgents.filter(
    (agent: any) => !agent.agentGroupLinks || agent.agentGroupLinks.length === 0
  );

  if (activeAgentsWithoutGroup.length === 0) {
    return;
  }

  const agentSIdsNeedingBackfill = _.uniq(
    activeAgentsWithoutGroup.map((agent) => agent.sId)
  );

  const activeAgentsBySid = _.keyBy(activeAgentsWithoutGroup, "sId");

  // For those agents, load all non-draft versions so we can reuse an existing
  // editor group if one is already associated with any version.
  const agents = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: {
        [Op.not]: "draft",
      },
      sId: {
        [Op.in]: agentSIdsNeedingBackfill,
      },
    },
  });

  if (agents.length === 0) {
    return;
  }

  const groupedAgents = Object.values(_.groupBy(agents, "sId"));

  logger.info(
    {
      workspaceId: workspace.sId,
      count: groupedAgents.length,
    },
    "Found agents with active versions missing editor groups"
  );

  await concurrentExecutor(
    groupedAgents,
    async (agentConfigs) => {
      const agentSid = agentConfigs[0].sId;
      const currentConfig = activeAgentsBySid[agentSid];

      if (!currentConfig) {
        logger.warn(
          { agent: agentSid },
          "Active configuration not found for agent when backfilling; skipping"
        );
        return;
      }

      const agentLogger = logger.child({ agentId: agentSid });

      await backfillMissingEditorGroupForAgent(
        auth,
        agentConfigs,
        currentConfig,
        workspace,
        execute,
        agentLogger
      );
    },
    { concurrency: 4 }
  );

  logger.info(
    `Missing agent editors group backfill completed for workspace ${workspace.sId}`
  );
};

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting missing agent editors group backfill");

    if (wId) {
      const ws = await WorkspaceModel.findOne({ where: { sId: wId } });
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await migrateWorkspaceMissingEditorGroups(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await migrateWorkspaceMissingEditorGroups(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Missing agent editors group backfill completed");
  }
);
