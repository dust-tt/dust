/*
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
import { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getInsertSQL, withTransaction } from "@app/lib/utils/sql_utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";


const CHUNK_SIZE = 5000;

const PROJECTS_FEATURE_FLAG =
  "projects" as const satisfies WhitelistableFeature;

const PROJECTS_GLOBAL_SKILL_ID = "projects" as const satisfies GlobalSkillId;

const SOURCE_MCP_SERVER: AutoInternalMCPServerNameType = "project_conversation";
const COMPANION_MCP_SERVER_TO_REMOVE: AutoInternalMCPServerNameType =
  "project_manager";

async function migrateProjectConversationToProjectsSkill(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute, deleteRelations }: { execute: boolean; deleteRelations: boolean }
): Promise<string> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const projectConversationView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      SOURCE_MCP_SERVER
    );

  if (!projectConversationView) {
    logger.info(
      { workspaceId: workspace.sId },
      "project_conversation MCP server view not found, skipping"
    );
    return "";
  }

  const projectManagerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      COMPANION_MCP_SERVER_TO_REMOVE
    );

  const agentsWithProjectConversation =
    await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerViewId: projectConversationView.id,
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

  if (agentsWithProjectConversation.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No active agents with project_conversation MCP configuration"
    );
    return "";
  }

  const agentConfigIds = agentsWithProjectConversation.map(
    (a) => a.agentConfigurationId
  );

  const agentsWithProjectsSkill = new Set<number>();
  for (const idChunk of chunk(agentConfigIds, CHUNK_SIZE)) {
    const existing = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        globalSkillId: PROJECTS_GLOBAL_SKILL_ID,
        agentConfigurationId: idChunk,
      },
    });
    for (const link of existing) {
      agentsWithProjectsSkill.add(link.agentConfigurationId);
    }
  }

  const agentsToMigrateByConfigId = agentsWithProjectConversation.filter(
    (a) => !agentsWithProjectsSkill.has(a.agentConfigurationId)
  );
  const seenAgentIds = new Set<number>();
  const agentsToMigrate = agentsToMigrateByConfigId.filter((a) => {
    if (seenAgentIds.has(a.agentConfigurationId)) {
      return false;
    }
    seenAgentIds.add(a.agentConfigurationId);
    return true;
  });

  if (agentsToMigrate.length === 0) {
    logger.info(
      {
        workspaceId: workspace.sId,
        alreadyHasProjectsSkill: agentsWithProjectsSkill.size,
      },
      "No agents need project_conversation → projects skill migration"
    );
    return "";
  }

  const migrateAgentIds = agentsToMigrate.map((a) => a.agentConfigurationId);

  const allProjectConversationConfigsToRemove =
    await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerViewId: projectConversationView.id,
        agentConfigurationId: { [Op.in]: migrateAgentIds },
      },
    });

  let projectManagerConfigsToRemove: AgentMCPServerConfigurationModel[] = [];
  if (projectManagerView) {
    projectManagerConfigsToRemove =
      await AgentMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          mcpServerViewId: projectManagerView.id,
          agentConfigurationId: { [Op.in]: migrateAgentIds },
        },
      });
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      agentsToMigrate: agentsToMigrate.length,
      projectConversationConfigs: allProjectConversationConfigsToRemove.length,
      projectManagerConfigs: projectManagerConfigsToRemove.length,
      execute,
    },
    execute
      ? "Migrating project_conversation MCP configuration to projects global skill"
      : "Dry run: would migrate project_conversation MCP configuration to projects global skill"
  );

  let revertSql = "";

  if (!execute) {
    return "";
  }

  for (const agentIdChunk of chunk(migrateAgentIds, CHUNK_SIZE)) {
    const chunkAgentIdSet = new Set(agentIdChunk);
    const chunkProjectConversationConfigs =
      allProjectConversationConfigsToRemove.filter((c) =>
        chunkAgentIdSet.has(c.agentConfigurationId)
      );
    const chunkProjectManagerConfigs = projectManagerConfigsToRemove.filter(
      (c) => chunkAgentIdSet.has(c.agentConfigurationId)
    );
    const chunkMcpConfigs = [
      ...chunkProjectConversationConfigs,
      ...chunkProjectManagerConfigs,
    ];
    const mcpServerConfigIds = chunkMcpConfigs.map((a) => a.id);

    const toolConfigsData = chunkMcpConfigs.map((a) => a.get({ plain: true }));

    const linkedProjectConfigs = await AgentProjectConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: { [Op.in]: mcpServerConfigIds },
      },
    });
    const projectConfigsData = linkedProjectConfigs.map((p) =>
      p.get({ plain: true })
    );

    if (deleteRelations) {
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

      const createdSkills = await withTransaction(async (transaction) => {
        const skills = await AgentSkillModel.bulkCreate(
          agentIdChunk.map((agentConfigurationId) => ({
            workspaceId: workspace.id,
            agentConfigurationId,
            globalSkillId: PROJECTS_GLOBAL_SKILL_ID,
            customSkillId: null,
          })),
          { transaction }
        );

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

        if (linkedProjectConfigs.length > 0) {
          await AgentProjectConfigurationModel.destroy({
            where: {
              workspaceId: workspace.id,
              id: { [Op.in]: linkedProjectConfigs.map((p) => p.id) },
            },
            transaction,
          });
        }

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
      for (const projectConfig of projectConfigsData) {
        revertSql +=
          getInsertSQL(AgentProjectConfigurationModel, projectConfig) + "\n";
      }
      for (const dataSourceConfig of dataSourceConfigsData) {
        revertSql +=
          getInsertSQL(AgentDataSourceConfigurationModel, dataSourceConfig) +
          "\n";
      }
      for (const tablesConfig of tablesConfigsData) {
        revertSql +=
          getInsertSQL(AgentTablesQueryConfigurationTableModel, tablesConfig) +
          "\n";
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
      const createdSkills = await withTransaction(async (transaction) => {
        const skills = await AgentSkillModel.bulkCreate(
          agentIdChunk.map((agentConfigurationId) => ({
            workspaceId: workspace.id,
            agentConfigurationId,
            globalSkillId: PROJECTS_GLOBAL_SKILL_ID,
            customSkillId: null,
          })),
          { transaction }
        );

        if (linkedProjectConfigs.length > 0) {
          await AgentProjectConfigurationModel.destroy({
            where: {
              workspaceId: workspace.id,
              id: { [Op.in]: linkedProjectConfigs.map((p) => p.id) },
            },
            transaction,
          });
        }

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
      for (const projectConfig of projectConfigsData) {
        revertSql +=
          getInsertSQL(AgentProjectConfigurationModel, projectConfig) + "\n";
      }
      for (const skill of createdSkills) {
        revertSql += `DELETE FROM "agent_skills" WHERE "id" = ${skill.id};\n`;
      }
    }
  }

  return revertSql;
}

async function listWorkspacesWithProjectsFeatureFlag(): Promise<
  LightWorkspaceType[]
> {
  const flags = await FeatureFlagModel.findAll({
    where: { name: PROJECTS_FEATURE_FLAG },
    attributes: ["workspaceId"],
    // @ts-expect-error -- It's a one-off script that operates across all workspaces
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });
  const workspaceIds = [...new Set(flags.map((f) => f.workspaceId))];
  if (workspaceIds.length === 0) {
    return [];
  }

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceIds);
  return workspaces.map((w) => renderLightWorkspaceType({ workspace: w }));
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to run on a single workspace (must have workspace-level projects feature flag)",
    },
    deleteRelations: {
      type: "boolean",
      describe:
        "Whether to delete agent configuration rows linked to removed MCP configs (data sources, tables, child agents)",
      default: false,
    },
  },
  async ({ execute, workspaceId, deleteRelations }, logger) => {
    if (
      !(
        isInternalMCPServerName(SOURCE_MCP_SERVER) &&
        isAutoInternalMCPServerName(SOURCE_MCP_SERVER)
      )
    ) {
      throw new Error(`Invalid MCP server name: ${SOURCE_MCP_SERVER}`);
    }

    const now = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "");
    let allRevertSql = "";

    const processWorkspace = async (workspace: LightWorkspaceType) => {
      const revertSql = await migrateProjectConversationToProjectsSkill(
        workspace,
        logger,
        { execute, deleteRelations }
      );
      if (execute && revertSql) {
        fs.writeFileSync(
          `${now}_projects_skill_from_project_conversation_revert_${workspace.sId}.sql`,
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
      const hasProjectsFlag = await FeatureFlagModel.findOne({
        where: {
          workspaceId: workspace.id,
          name: PROJECTS_FEATURE_FLAG,
        },
      });
      if (!hasProjectsFlag) {
        throw new Error(
          `Workspace ${workspaceId} does not have the workspace-level "${PROJECTS_FEATURE_FLAG}" feature flag; skipping.`
        );
      }
      await processWorkspace(renderLightWorkspaceType({ workspace }));
    } else {
      const workspaces = await listWorkspacesWithProjectsFeatureFlag();
      logger.info(
        { workspaceCount: workspaces.length },
        "Running on workspaces with workspace-level projects feature flag"
      );
      if (workspaces.length === 0) {
        logger.info("No workspaces with projects feature flag; nothing to do.");
      } else {
        await concurrentExecutor(workspaces, processWorkspace, {
          concurrency: 1,
        });
      }
    }

    if (execute && allRevertSql) {
      fs.writeFileSync(
        `${now}_projects_skill_from_project_conversation_revert_all.sql`,
        allRevertSql
      );
    }
  }
);
*/
