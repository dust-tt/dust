/**
 * Productboard moved from a manually-attached internal MCP server tool to an
 * auto, skill-wrapped one: workflow instructions used to live on
 * `PRODUCTBOARD_SERVER.instructions` and now live on the `productboard` global
 * skill instead (the server's instructions are `null`). An agent that already
 * has productboard configured as a manual tool (`AgentMCPServerConfigurationModel`)
 * keeps working but silently loses those instructions, since nothing attaches
 * the skill for it.
 *
 * This backfill adds the `productboard` global skill to every active agent that
 * has the tool manually configured, then removes the now-redundant manual
 * config so the agent builder doesn't show productboard twice.
 *
 * Usage:
 *   npx tsx migrations/20260624_migrate_productboard_tool_to_skill.ts [--execute] [--wId <sId>]
 */

import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Logger } from "pino";
import { Op } from "sequelize";

const PRODUCTBOARD_GLOBAL_SKILL_ID = "productboard";

type WorkspaceStats = {
  agentsFound: number;
  skillsAdded: number;
  skillsAlreadyPresent: number;
  configsDeleted: number;
  errors: number;
};

function emptyStats(): WorkspaceStats {
  return {
    agentsFound: 0,
    skillsAdded: 0,
    skillsAlreadyPresent: 0,
    configsDeleted: 0,
    errors: 0,
  };
}

function addStats(total: WorkspaceStats, delta: WorkspaceStats): void {
  for (const key of Object.keys(total) as (keyof WorkspaceStats)[]) {
    total[key] += delta[key];
  }
}

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  { execute }: { execute: boolean },
  logger: Logger
): Promise<WorkspaceStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const workspaceId = auth.getNonNullableWorkspace().id;
  const stats = emptyStats();

  const activeAgents = await AgentConfigurationModel.findAll({
    attributes: ["id", "sId", "name"],
    where: { workspaceId, status: "active" },
    raw: true,
  });
  if (activeAgents.length === 0) {
    return stats;
  }
  const activeAgentById = new Map(
    activeAgents.map((agent) => [agent.id, agent])
  );

  const configs = await AgentMCPServerConfigurationModel.findAll({
    attributes: ["id", "agentConfigurationId", "internalMCPServerId"],
    where: {
      workspaceId,
      agentConfigurationId: { [Op.in]: activeAgents.map((agent) => agent.id) },
      internalMCPServerId: { [Op.ne]: null },
    },
    raw: true,
  });

  const productboardConfigIdsByAgent = new Map<number, number[]>();
  for (const config of configs) {
    if (
      !matchesInternalMCPServerName(config.internalMCPServerId, "productboard")
    ) {
      continue;
    }
    const existing = productboardConfigIdsByAgent.get(
      config.agentConfigurationId
    );
    if (existing) {
      existing.push(config.id);
    } else {
      productboardConfigIdsByAgent.set(config.agentConfigurationId, [
        config.id,
      ]);
    }
  }

  stats.agentsFound = productboardConfigIdsByAgent.size;

  for (const [
    agentConfigurationId,
    configIds,
  ] of productboardConfigIdsByAgent) {
    const agent = activeAgentById.get(agentConfigurationId);
    if (!agent) {
      continue;
    }

    try {
      const existingSkill = await AgentSkillModel.findOne({
        where: {
          workspaceId,
          agentConfigurationId,
          globalSkillId: PRODUCTBOARD_GLOBAL_SKILL_ID,
        },
      });

      logger.info(
        {
          workspaceId: workspace.sId,
          agentId: agent.sId,
          agentName: agent.name,
          configCount: configIds.length,
          skillAlreadyPresent: !!existingSkill,
        },
        execute
          ? "Migrating agent from productboard tool to skill"
          : "Dry run: would migrate agent from productboard tool to skill"
      );

      if (existingSkill) {
        stats.skillsAlreadyPresent++;
      } else {
        stats.skillsAdded++;
        if (execute) {
          await AgentSkillModel.create({
            workspaceId,
            agentConfigurationId,
            globalSkillId: PRODUCTBOARD_GLOBAL_SKILL_ID,
          });
        }
      }

      stats.configsDeleted += configIds.length;
      if (execute) {
        await AgentMCPServerConfigurationModel.destroy({
          where: { workspaceId, id: { [Op.in]: configIds } },
        });
      }
    } catch (error) {
      stats.errors++;
      logger.error(
        { error, workspaceId: workspace.sId, agentId: agent.sId },
        "Failed to migrate agent from productboard tool to skill"
      );
    }
  }

  return stats;
}

makeScript(
  {
    wId: {
      type: "string",
      describe:
        "Process a single workspace (sId). Omit to run on all workspaces.",
    },
  },
  async ({ wId, execute }, logger) => {
    const totals = emptyStats();

    await runOnAllWorkspaces(
      async (workspace) => {
        const stats = await migrateWorkspace(workspace, { execute }, logger);
        addStats(totals, stats);
        if (stats.agentsFound > 0) {
          logger.info(
            { workspaceId: workspace.sId, ...stats },
            execute
              ? "Migrated workspace agents off the productboard tool"
              : "Dry run: workspace has agents using the productboard tool"
          );
        }
      },
      { wId }
    );

    logger.info(
      { execute, ...totals },
      execute
        ? "Productboard tool-to-skill migration complete"
        : "Productboard tool-to-skill migration dry run complete"
    );
  }
);
