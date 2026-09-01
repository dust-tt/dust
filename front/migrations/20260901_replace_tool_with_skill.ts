import type { Logger } from "@app/logger/logger";

import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";

interface AgentChange {
  agentId: string;
  agentName: string;
  sourceVersion: number;
  toolConfigurationIds: string[];
}

async function buildReplacementPlan({
  mcpServerViewModelId,
  workspaceModelId,
}: {
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

  return agents.map((agent) => ({
    agentId: agent.sId,
    agentName: agent.name,
    sourceVersion: agent.version,
    toolConfigurationIds: agent.mcpServerConfigurations.map(
      (configuration) => configuration.sId
    ),
  }));
}

async function createReplacementVersion(
  auth: Authenticator,
  {
    change,
    skillId,
  }: {
    change: AgentChange;
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
  if (agentConfiguration.version !== change.sourceVersion) {
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
      `Agent ${change.agentId} no longer contains the planned tool configurations. Run the script again.`
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
      agentId: change.agentId,
      agentName: change.agentName,
      changes: {
        archiveAgentVersion: change.sourceVersion,
        createAgentVersion: targetVersion,
        skillIdOnNewVersion: skillId,
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
    workspaceId: {
      demandOption: true,
      describe: "Workspace sId to target",
      type: "string" as const,
    },
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
  async ({ execute, workspaceId, mcpServerViewId, skillId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}.`);
    }

    if (!isResourceSId("mcp_server_view", mcpServerViewId)) {
      throw new Error(
        `Invalid MCP server view sId: ${mcpServerViewId}. Expected an msv_... ID.`
      );
    }
    if (!isResourceSId("skill", skillId)) {
      throw new Error(
        `Invalid skill sId: ${skillId}. Expected a custom skl_... ID.`
      );
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    // Both resource fetches are scoped to the authenticated workspace.
    const [mcpServerView, customSkills] = await Promise.all([
      MCPServerViewResource.fetchById(auth, mcpServerViewId, {
        includeDeleted: true,
      }),
      SkillResource.fetchByIds(auth, [skillId], {
        onlyActive: true,
        withFileAttachments: false,
        withInstructions: false,
        withTools: false,
      }),
    ]);
    if (!mcpServerView) {
      throw new Error(
        `MCP server view not found in workspace ${workspaceId}: ${mcpServerViewId}.`
      );
    }

    const [customSkill] = customSkills;
    if (!customSkill) {
      throw new Error(
        `Active custom skill not found in workspace ${workspaceId}: ${skillId}.`
      );
    }

    const plan = await buildReplacementPlan({
      mcpServerViewModelId: mcpServerView.id,
      workspaceModelId: workspace.id,
    });

    for (const change of plan) {
      const targetVersion = execute
        ? await createReplacementVersion(auth, {
            change,
            skillId: customSkill.sId,
          })
        : change.sourceVersion + 1;

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
        agentVersionsCreated: execute ? plan.length : 0,
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
