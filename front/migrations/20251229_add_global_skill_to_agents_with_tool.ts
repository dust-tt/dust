import chunk from "lodash/chunk";
import type { Logger } from "pino";

import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  type AutoInternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillId } from "@app/lib/resources/skill/global/registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

// Safe chunk size for PostgreSQL's 65,535 parameter limit.
// AgentSkillModel has 4 fields, so 65535/4 ≈ 16k. Using 5k for safety.
const CHUNK_SIZE = 5000;

const TOOL_TO_SKILL_MAP: Record<string, GlobalSkillId> = {
  interactive_content: "frames",
  deep_dive: "go-deep",
};

async function addGlobalSkillToAgentsWithTool(
  workspace: LightWorkspaceType,
  logger: Logger,
  {
    execute,
    mcpServerName,
  }: {
    execute: boolean;
    mcpServerName: AutoInternalMCPServerNameType;
  }
) {
  const globalSkillId = TOOL_TO_SKILL_MAP[mcpServerName];
  if (!globalSkillId) {
    throw new Error(`No skill mapping for MCP server: ${mcpServerName}`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // 1. Get the MCP server view for this tool.
  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      mcpServerName
    );

  if (!mcpServerView) {
    logger.info(
      { mcpServerName, workspaceId: workspace.sId },
      "MCP server view not found, skipping"
    );
    return;
  }

  // 2. Find all agent configs using this MCP server view.
  const agentsWithTool = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: mcpServerView.id,
    },
  });

  if (agentsWithTool.length === 0) {
    logger.info(
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        agentCount: agentsWithTool.length,
        mcpServerViewId: mcpServerView.id,
      },
      `No agents found with tool ${mcpServerName}`
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      agentCount: agentsWithTool.length,
      mcpServerViewId: mcpServerView.id,
    },
    `Found agents with tool ${mcpServerName}`
  );

  // 3. Get existing agent-skill links to avoid duplicates (chunked for large IN clauses).
  const agentConfigIds = agentsWithTool.map((a) => a.agentConfigurationId);
  const agentsWithSkill = new Set<number>();

  for (const idChunk of chunk(agentConfigIds, CHUNK_SIZE)) {
    const existingSkillLinks = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        globalSkillId,
        agentConfigurationId: idChunk,
      },
    });
    for (const link of existingSkillLinks) {
      agentsWithSkill.add(link.agentConfigurationId);
    }
  }

  // 4. Filter agents that need skill creation.
  const agentsToCreate = agentsWithTool.filter(
    (a) => !agentsWithSkill.has(a.agentConfigurationId)
  );

  if (agentsToCreate.length === 0) {
    logger.info(
      {
        workspaceId: workspace.id,
        toCreate: agentsToCreate.length,
        alreadyHasSkill: agentsWithSkill.size,
      },
      "No agents need skill creation"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.id,
      toCreate: agentsToCreate.length,
      alreadyHasSkill: agentsWithSkill.size,
    },
    "Creating skills for agents"
  );

  if (execute) {
    for (const createChunk of chunk(agentsToCreate, CHUNK_SIZE)) {
      await AgentSkillModel.bulkCreate(
        createChunk.map((a) => ({
          workspaceId: workspace.id,
          agentConfigurationId: a.agentConfigurationId,
          globalSkillId,
          customSkillId: null,
        }))
      );
    }
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optional workspace sId to run on single workspace",
    },
    mcpServerName: {
      type: "string",
      required: true,
      description: "MCP server name (interactive_content or deep_dive)",
    },
  },
  async ({ execute, workspaceId, mcpServerName }, logger) => {
    if (
      !(
        isInternalMCPServerName(mcpServerName) &&
        isAutoInternalMCPServerName(mcpServerName)
      )
    ) {
      throw new Error(`Invalid MCP server name: ${mcpServerName}`);
    }

    const opts = { execute, mcpServerName };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      await addGlobalSkillToAgentsWithTool(
        renderLightWorkspaceType({ workspace }),
        logger,
        opts
      );
    } else {
      await runOnAllWorkspaces(async (workspace) =>
        addGlobalSkillToAgentsWithTool(workspace, logger, opts)
      );
    }
  }
);
