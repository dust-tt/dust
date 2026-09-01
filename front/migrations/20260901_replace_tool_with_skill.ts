import type { Logger } from "@app/logger/logger";
import { Op } from "sequelize";

import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";

interface AgentChange {
  agentConfigurationModelId: ModelId;
  agentId: string;
  agentName: string;
  hasSkill: boolean;
  sourceVersion: number;
  targetVersion: number;
  toolConfigurationIds: string[];
}

async function buildReplacementPlan({
  customSkillModelId,
  mcpServerViewModelId,
  workspaceModelId,
}: {
  customSkillModelId: ModelId;
  mcpServerViewModelId: ModelId;
  workspaceModelId: ModelId;
}): Promise<AgentChange[]> {
  const agents = await AgentConfigurationModel.findAll({
    attributes: ["id", "sId", "name", "version"],
    include: [
      {
        model: AgentMCPServerConfigurationModel,
        as: "mcpServerConfigurations",
        attributes: ["id", "sId"],
        required: true,
        where: {
          mcpServerViewId: mcpServerViewModelId,
          workspaceId: workspaceModelId,
        },
      },
    ],
    order: [
      ["name", "ASC"],
      ["sId", "ASC"],
    ],
    where: {
      status: "active",
      workspaceId: workspaceModelId,
    },
  });

  if (agents.length === 0) {
    return [];
  }

  const existingSkillLinks = await AgentSkillModel.findAll({
    attributes: ["agentConfigurationId"],
    where: {
      agentConfigurationId: { [Op.in]: agents.map((agent) => agent.id) },
      customSkillId: customSkillModelId,
      workspaceId: workspaceModelId,
    },
  });
  const agentConfigurationIdsWithSkill = new Set(
    existingSkillLinks.map((link) => link.agentConfigurationId)
  );

  return agents.map((agent) => ({
    agentConfigurationModelId: agent.id,
    agentId: agent.sId,
    agentName: agent.name,
    hasSkill: agentConfigurationIdsWithSkill.has(agent.id),
    sourceVersion: agent.version,
    targetVersion: agent.version + 1,
    toolConfigurationIds: agent.mcpServerConfigurations.map(
      (configuration) => configuration.sId
    ),
  }));
}

async function createReplacementVersion(
  auth: Authenticator,
  {
    change,
    mcpServerViewId,
    skillId,
  }: {
    change: AgentChange;
    mcpServerViewId: string;
    skillId: string;
  }
): Promise<number> {
  const contextResult = await getAgentConfigurationContext(
    auth,
    change.agentId,
    {
      requireEditorGroup: true,
      dangerouslySkipPermissionFiltering: true,
    }
  );
  if (contextResult.isErr()) {
    throw new Error(
      `Cannot create a new version of agent ${change.agentId}: ${contextResult.error.api_error.message}`
    );
  }

  const { agentConfiguration, editorUsers, skills } = contextResult.value;
  if (
    agentConfiguration.id !== change.agentConfigurationModelId ||
    agentConfiguration.version !== change.sourceVersion
  ) {
    throw new Error(
      `Agent ${change.agentId} changed after the replacement plan was built. Run the script again.`
    );
  }

  const serverSideActions = agentConfiguration.actions.filter(
    isServerSideMCPServerConfiguration
  );
  const toolConfigurationIds = new Set(change.toolConfigurationIds);
  const retainedActions = serverSideActions.filter(
    (action) => !toolConfigurationIds.has(action.sId)
  );
  if (
    serverSideActions.length - retainedActions.length !==
    toolConfigurationIds.size
  ) {
    throw new Error(
      `Agent ${change.agentId} no longer contains the planned configurations for MCP server view ${mcpServerViewId}. Run the script again.`
    );
  }

  const skillIds = [
    ...new Set([...skills.map((existingSkill) => existingSkill.sId), skillId]),
  ];
  const authorId = agentConfiguration.versionAuthorId;
  if (authorId === null) {
    throw new Error(
      `Agent ${change.agentId} has no version author and cannot be saved as a new version.`
    );
  }

  const result = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agentConfiguration.sId,
    assistant: {
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      instructions: agentConfiguration.instructions,
      instructionsHtml: agentConfiguration.instructionsHtml,
      pictureUrl: agentConfiguration.pictureUrl,
      status: agentConfiguration.status,
      scope: agentConfiguration.scope,
      model: agentConfiguration.model,
      actions: retainedActions,
      templateId: agentConfiguration.templateId,
      tags: agentConfiguration.tags,
      editors: editorUsers.map((user) => ({ sId: user.sId })),
      skills: skillIds.map((skillId) => ({ sId: skillId })),
      additionalRequestedSpaceIds: agentConfiguration.requestedSpaceIds,
    },
    authorId,
    dangerouslySkipPermissionFiltering: true,
  });
  if (result.isErr()) {
    throw new Error(
      `Failed to create a new version of agent ${change.agentId}: ${result.error.message}`
    );
  }

  return result.value.version;
}

function logAgentChange(
  {
    change,
    execute,
    mcpServerViewId,
    skillId,
    targetVersion,
    workspaceId,
  }: {
    change: AgentChange;
    execute: boolean;
    mcpServerViewId: string;
    skillId: string;
    targetVersion: number;
    workspaceId: string;
  },
  logger: Logger
): void {
  logger.info(
    {
      agentConfigurationModelId: change.agentConfigurationModelId,
      agentId: change.agentId,
      agentName: change.agentName,
      changes: {
        addAgentSkillIdToNewVersion: change.hasSkill ? null : skillId,
        archiveAgentVersion: change.sourceVersion,
        createAgentVersion: targetVersion,
        toolConfigurationIdsNotCopiedToNewVersion: change.toolConfigurationIds,
      },
      mcpServerViewId,
      workspaceId,
    },
    execute
      ? "Created a new agent version with the tool replaced by the skill"
      : "Dry run: would create a new agent version with the tool replaced by the skill"
  );
}

makeScript(
  {
    mcpServerViewId: {
      demandOption: true,
      describe: "MCP server view sId (msv_...) to replace in active agents",
      type: "string" as const,
    },
    skillId: {
      demandOption: true,
      describe: "Custom skill sId (skl_...) to add to agents",
      type: "string" as const,
    },
  },
  async ({ execute, mcpServerViewId, skillId }, logger) => {
    const parsedMCPServerViewId = getResourceNameAndIdFromSId(mcpServerViewId);
    if (
      !parsedMCPServerViewId ||
      parsedMCPServerViewId.resourceName !== "mcp_server_view"
    ) {
      throw new Error(
        `Invalid MCP server view sId: ${mcpServerViewId}. Expected an msv_... ID.`
      );
    }

    const parsedSkillId = getResourceNameAndIdFromSId(skillId);
    if (!parsedSkillId || parsedSkillId.resourceName !== "skill") {
      throw new Error(
        `Invalid skill sId: ${skillId}. Expected a custom skl_... ID.`
      );
    }
    if (
      parsedSkillId.workspaceModelId !== parsedMCPServerViewId.workspaceModelId
    ) {
      throw new Error(
        "The MCP server view and custom skill belong to different workspaces."
      );
    }

    const [workspace] = await WorkspaceResource.fetchByModelIds([
      parsedMCPServerViewId.workspaceModelId,
    ]);
    if (!workspace) {
      throw new Error(
        `Workspace ${parsedMCPServerViewId.workspaceModelId} encoded in ${mcpServerViewId} was not found.`
      );
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      mcpServerViewId,
      { includeDeleted: true }
    );
    if (!mcpServerView) {
      throw new Error(`MCP server view not found: ${mcpServerViewId}.`);
    }

    const [customSkill] = await SkillResource.fetchByIds(auth, [skillId], {
      onlyActive: true,
      withFileAttachments: false,
      withInstructions: false,
      withTools: false,
    });
    if (!customSkill) {
      throw new Error(
        `Active custom skill not found in workspace ${workspace.sId}: ${skillId}.`
      );
    }

    const plan = await buildReplacementPlan({
      customSkillModelId: customSkill.id,
      mcpServerViewModelId: mcpServerView.id,
      workspaceModelId: workspace.id,
    });

    let createdVersionCount = 0;
    for (const change of plan) {
      const targetVersion = execute
        ? await createReplacementVersion(auth, {
            change,
            mcpServerViewId,
            skillId: customSkill.sId,
          })
        : change.targetVersion;

      if (execute) {
        createdVersionCount++;
      }
      logAgentChange(
        {
          change,
          execute,
          mcpServerViewId,
          skillId: customSkill.sId,
          targetVersion,
          workspaceId: workspace.sId,
        },
        logger
      );
    }

    logger.info(
      {
        agentCount: plan.length,
        agentSkillLinksToAdd: plan.filter((change) => !change.hasSkill).length,
        agentVersionsCreated: createdVersionCount,
        agentVersionsToCreate: execute ? 0 : plan.length,
        execute,
        mcpServerViewId,
        skillId: customSkill.sId,
        toolConfigurationsNotCopied: plan.reduce(
          (count, change) => count + change.toolConfigurationIds.length,
          0
        ),
        workspaceId: workspace.sId,
      },
      execute
        ? "Finished replacing tool with skill in new agent versions"
        : "Dry run: finished listing new agent versions"
    );
  }
);
