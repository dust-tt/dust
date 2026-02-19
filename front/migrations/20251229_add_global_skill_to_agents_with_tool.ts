import chunk from "lodash/chunk";
import fs from "fs";
import type { Logger } from "pino";
import { Op } from "sequelize";

import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  type AutoInternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillId } from "@app/lib/resources/skill/global/registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getInsertSQL, withTransaction } from "@app/lib/utils/sql_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

// Safe chunk size for PostgreSQL's 65,535 parameter limit.
// AgentSkillModel has 4 fields, so 65535/4 ≈ 16k. Using 5k for safety.
const CHUNK_SIZE = 5000;

const TOOL_TO_SKILL_MAP: Record<string, GlobalSkillId> = {
  interactive_content: "frames",
  deep_dive: "go-deep",
};

async function migrateToolToSkill(
  workspace: LightWorkspaceType,
  logger: Logger,
  {
    execute,
    mcpServerName,
    deleteRelations,
  }: {
    execute: boolean;
    mcpServerName: AutoInternalMCPServerNameType;
    deleteRelations: boolean;
  }
): Promise<string> {
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
    return "";
  }

  // 2. Find all agent configs using this MCP server view (only active agents).
  const agentsWithTool = await AgentMCPServerConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      mcpServerViewId: mcpServerView.id,
    },
    include: [
      {
        model: AgentConfigurationModel,
        required: true,
        where: { status: "active" },
        attributes: [],
      },
    ],
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
    return "";
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

  // 4. Filter agents that need tool to skill migration.
  const agentsToMigrate = agentsWithTool.filter(
    (a) => !agentsWithSkill.has(a.agentConfigurationId)
  );

  if (agentsToMigrate.length === 0) {
    logger.info(
      {
        workspaceId: workspace.id,
        toMigrate: agentsToMigrate.length,
        alreadyHasSkill: agentsWithSkill.size,
      },
      `No agents need ${mcpServerName} tool to skill migration`
    );
    return "";
  }

  logger.info(
    {
      workspaceId: workspace.id,
      toMigrate: agentsToMigrate.length,
      alreadyHasSkill: agentsWithSkill.size,
    },
    `Migrating ${mcpServerName} tool to skill for agents`
  );

  let revertSql = "";

  if (execute) {
    for (const migrateChunk of chunk(agentsToMigrate, CHUNK_SIZE)) {
      const mcpServerConfigIds = migrateChunk.map((a) => a.id);

      // Capture tool configs before transaction for revert SQL.
      const toolConfigsData = migrateChunk.map((a) => a.get({ plain: true }));

      if (deleteRelations) {
        logger.info(
          `Deleting relations of ${migrateChunk.length} agent MCP configs and migrating to skill`
        );
        // Flag is on, delete all relations of agent MCP configurations

        // Capture linked configs for revert SQL (all models with FK to AgentMCPServerConfigurationModel).
        const whereClause = {
          workspaceId: workspace.id,
          mcpServerConfigurationId: { [Op.in]: mcpServerConfigIds },
        };

        const linkedDataSourceConfigs =
          await AgentDataSourceConfigurationModel.findAll({
            where: whereClause,
          });
        const linkedTablesConfigs =
          await AgentTablesQueryConfigurationTableModel.findAll({
            where: whereClause,
          });
        const linkedChildAgentConfigs =
          await AgentChildAgentConfigurationModel.findAll({
            where: whereClause,
          });

        const dataSourceConfigsData = linkedDataSourceConfigs.map((d) =>
          d.get({ plain: true })
        );
        const tablesConfigsData = linkedTablesConfigs.map((t) =>
          t.get({ plain: true })
        );
        const childAgentConfigsData = linkedChildAgentConfigs.map((c) =>
          c.get({ plain: true })
        );

        const totalLinked =
          linkedDataSourceConfigs.length +
          linkedTablesConfigs.length +
          linkedChildAgentConfigs.length;

        if (totalLinked > 0) {
          logger.info(
            {
              workspaceId: workspace.id,
              linkedDataSourceConfigs: linkedDataSourceConfigs.length,
              linkedTablesConfigs: linkedTablesConfigs.length,
              linkedChildAgentConfigs: linkedChildAgentConfigs.length,
              chunkSize: migrateChunk.length,
            },
            `Found linked configs to delete`
          );
        }

        const createdSkills = await withTransaction(async (transaction) => {
          // Add skill to agents.
          const skills = await AgentSkillModel.bulkCreate(
            migrateChunk.map((a) => ({
              workspaceId: workspace.id,
              agentConfigurationId: a.agentConfigurationId,
              globalSkillId,
              customSkillId: null,
            })),
            { transaction }
          );

          // Remove linked configs first (FK constraints).
          if (linkedDataSourceConfigs.length > 0) {
            await AgentDataSourceConfigurationModel.destroy({
              where: {
                workspaceId: workspace.id,
                id: { [Op.in]: linkedDataSourceConfigs.map((d) => d.id) },
              },
              transaction,
            });
          }
          if (linkedTablesConfigs.length > 0) {
            await AgentTablesQueryConfigurationTableModel.destroy({
              where: {
                workspaceId: workspace.id,
                id: { [Op.in]: linkedTablesConfigs.map((t) => t.id) },
              },
              transaction,
            });
          }
          if (linkedChildAgentConfigs.length > 0) {
            await AgentChildAgentConfigurationModel.destroy({
              where: {
                workspaceId: workspace.id,
                id: { [Op.in]: linkedChildAgentConfigs.map((c) => c.id) },
              },
              transaction,
            });
          }

          // Remove tool from agents.
          await AgentMCPServerConfigurationModel.destroy({
            where: {
              workspaceId: workspace.id,
              id: { [Op.in]: mcpServerConfigIds },
            },
            transaction,
          });

          return skills;
        });

        // Generate revert SQL after successful transaction.
        // Insert parent records first, then child records.
        for (const toolConfig of toolConfigsData) {
          revertSql +=
            getInsertSQL(AgentMCPServerConfigurationModel, toolConfig) + "\n";
        }
        for (const dataSourceConfig of dataSourceConfigsData) {
          revertSql +=
            getInsertSQL(AgentDataSourceConfigurationModel, dataSourceConfig) +
            "\n";
        }
        for (const tablesConfig of tablesConfigsData) {
          revertSql +=
            getInsertSQL(
              AgentTablesQueryConfigurationTableModel,
              tablesConfig
            ) + "\n";
        }
        for (const childAgentConfig of childAgentConfigsData) {
          revertSql +=
            getInsertSQL(AgentChildAgentConfigurationModel, childAgentConfig) +
            "\n";
        }
        for (const skill of createdSkills) {
          revertSql += `DELETE FROM "agent_skills" WHERE "id" = ${skill.id};\n`;
        }
      } else {
        logger.info(
          `Migrating ${migrateChunk.length} agent MCP configs to skill`
        );
        // Simple migration, only delete mcp server configs
        const createdSkills = await withTransaction(async (transaction) => {
          const skills = await AgentSkillModel.bulkCreate(
            migrateChunk.map((a) => ({
              workspaceId: workspace.id,
              agentConfigurationId: a.agentConfigurationId,
              globalSkillId,
              customSkillId: null,
            })),
            { transaction }
          );

          await AgentMCPServerConfigurationModel.destroy({
            where: {
              workspaceId: workspace.id,
              id: { [Op.in]: mcpServerConfigIds },
            },
            transaction,
          });

          return skills;
        });

        for (const toolConfig of toolConfigsData) {
          revertSql +=
            getInsertSQL(AgentMCPServerConfigurationModel, toolConfig) + "\n";
        }
        for (const skill of createdSkills) {
          revertSql += `DELETE FROM "agent_skills" WHERE "id" = ${skill.id};\n`;
        }
      }
    }
  }

  return revertSql;
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
    deleteRelations: {
      type: "boolean",
      describe: "Whether to delete agent configurations relations",
      default: false,
    },
  },
  async ({ execute, workspaceId, mcpServerName, deleteRelations }, logger) => {
    if (
      !(
        isInternalMCPServerName(mcpServerName) &&
        isAutoInternalMCPServerName(mcpServerName)
      )
    ) {
      throw new Error(`Invalid MCP server name: ${mcpServerName}`);
    }

    const now = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "");
    const opts = { execute, mcpServerName, deleteRelations };
    let allRevertSql = "";

    const processWorkspace = async (workspace: LightWorkspaceType) => {
      const revertSql = await migrateToolToSkill(workspace, logger, opts);
      if (execute && revertSql) {
        fs.writeFileSync(
          `${now}_tool_to_skill_revert_${mcpServerName}_${workspace.sId}.sql`,
          revertSql
        );
      }
      allRevertSql += revertSql;
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await processWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      await runOnAllWorkspaces(processWorkspace);
    }

    if (execute && allRevertSql) {
      fs.writeFileSync(
        `${now}_tool_to_skill_revert_${mcpServerName}_all.sql`,
        allRevertSql
      );
    }
  }
);
