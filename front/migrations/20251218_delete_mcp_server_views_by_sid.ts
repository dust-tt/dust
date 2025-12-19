import assert from "assert";
import { Op } from "sequelize";

import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { dangerouslyMakeSIdWithCustomFirstPrefix } from "@app/lib/resources/string_ids";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const TARGET_ID: ModelId = 1007;
const PREFIX = 1;
const BATCH_SIZE = 100;

async function getMaxWorkspaceId(): Promise<ModelId> {
  const result = await WorkspaceModel.findOne({
    attributes: ["id"],
    order: [["id", "DESC"]],
    limit: 1,
  });
  assert(result, "No workspaces found - cannot proceed");
  return result.id;
}

function generateSIds(maxWorkspaceId: ModelId): string[] {
  const sIds: string[] = [];
  for (let workspaceId = 1; workspaceId <= maxWorkspaceId; workspaceId++) {
    sIds.push(
      dangerouslyMakeSIdWithCustomFirstPrefix("internal_mcp_server", {
        id: TARGET_ID,
        workspaceId,
        firstPrefix: PREFIX,
      })
    );
  }
  return sIds;
}

async function deleteRelatedRecordsForViews(
  mcpServerViews: MCPServerViewModel[],
  execute: boolean,
  logger: Logger
): Promise<void> {
  const mcpServerViewIds = mcpServerViews.map((view) => view.id);

  const agentMCPConfigs: AgentMCPServerConfigurationModel[] =
    await AgentMCPServerConfigurationModel.findAll({
      attributes: ["id", "workspaceId"],
      where: {
        mcpServerViewId: { [Op.in]: mcpServerViewIds },
      },
    });

  const agentConfigIds = agentMCPConfigs.map(
    (c: AgentMCPServerConfigurationModel) => c.id
  );

  logger.info(
    { count: agentMCPConfigs.length },
    execute
      ? "Deleting AgentMCPServerConfigurationModel and children"
      : "Would delete AgentMCPServerConfigurationModel and children (dry run)"
  );

  if (execute && agentConfigIds.length > 0) {
    const dataSourceDeleted: number =
      await AgentDataSourceConfigurationModel.destroy({
        where: {
          mcpServerConfigurationId: { [Op.in]: agentConfigIds },
        },
      });
    logger.info(
      { deletedCount: dataSourceDeleted },
      "Deleted AgentDataSourceConfigurationModel records"
    );

    const tablesQueryDeleted: number =
      await AgentTablesQueryConfigurationTableModel.destroy({
        where: {
          mcpServerConfigurationId: { [Op.in]: agentConfigIds },
        },
      });
    logger.info(
      { deletedCount: tablesQueryDeleted },
      "Deleted AgentTablesQueryConfigurationTableModel records"
    );

    const childAgentDeleted: number =
      await AgentChildAgentConfigurationModel.destroy({
        where: {
          mcpServerConfigurationId: { [Op.in]: agentConfigIds },
        },
      });
    logger.info(
      { deletedCount: childAgentDeleted },
      "Deleted AgentChildAgentConfigurationModel records"
    );

    const agentMcpDeleted: number =
      await AgentMCPServerConfigurationModel.destroy({
        where: {
          id: { [Op.in]: agentConfigIds },
        },
      });
    logger.info(
      { deletedCount: agentMcpDeleted },
      "Deleted AgentMCPServerConfigurationModel records"
    );
  }

  const conversationViews: ConversationMCPServerViewModel[] =
    await ConversationMCPServerViewModel.findAll({
      attributes: ["id"],
      where: {
        mcpServerViewId: { [Op.in]: mcpServerViewIds },
      },
    });

  logger.info(
    { count: conversationViews.length },
    execute
      ? "Deleting ConversationMCPServerViewModel records"
      : "Would delete ConversationMCPServerViewModel records (dry run)"
  );

  if (execute && conversationViews.length > 0) {
    const conversationDeleted: number =
      await ConversationMCPServerViewModel.destroy({
        where: {
          id: {
            [Op.in]: conversationViews.map(
              (c: ConversationMCPServerViewModel) => c.id
            ),
          },
        },
      });
    logger.info(
      { deletedCount: conversationDeleted },
      "Deleted ConversationMCPServerViewModel records"
    );
  }

  const skillConfigs: SkillMCPServerConfigurationModel[] =
    await SkillMCPServerConfigurationModel.findAll({
      attributes: ["id"],
      where: {
        mcpServerViewId: { [Op.in]: mcpServerViewIds },
      },
    });

  logger.info(
    { count: skillConfigs.length },
    execute
      ? "Deleting SkillMCPServerConfigurationModel records"
      : "Would delete SkillMCPServerConfigurationModel records (dry run)"
  );

  if (execute && skillConfigs.length > 0) {
    const skillDeleted: number = await SkillMCPServerConfigurationModel.destroy(
      {
        where: {
          id: {
            [Op.in]: skillConfigs.map(
              (c: SkillMCPServerConfigurationModel) => c.id
            ),
          },
        },
      }
    );
    logger.info(
      { deletedCount: skillDeleted },
      "Deleted SkillMCPServerConfigurationModel records"
    );
  }
}

async function deleteMCPServerViews(
  mcpServerViews: MCPServerViewModel[],
  execute: boolean,
  logger: Logger
): Promise<number> {
  const mcpServerViewIds = mcpServerViews.map((v) => v.id);

  logger.info(
    { count: mcpServerViews.length, ids: mcpServerViewIds },
    execute
      ? "Deleting MCPServerViewModel records (hard delete)"
      : "Would delete MCPServerViewModel records (dry run)"
  );

  if (execute && mcpServerViews.length > 0) {
    const deleted: number = await MCPServerViewModel.destroy({
      where: {
        id: { [Op.in]: mcpServerViewIds },
      },
      hardDelete: true,
    });
    return deleted;
  }

  return 0;
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { execute, targetId: TARGET_ID, prefix: PREFIX },
    "Starting MCPServerView deletion script"
  );

  const maxWorkspaceId = await getMaxWorkspaceId();
  logger.info({ maxWorkspaceId }, "Found max workspace ID");

  const sIds = generateSIds(maxWorkspaceId);
  logger.info(
    {
      totalSIds: sIds.length,
      sampleSIds: sIds.slice(0, 5),
    },
    "Generated sIds to search for"
  );

  const batches: string[][] = [];
  for (let i = 0; i < sIds.length; i += BATCH_SIZE) {
    batches.push(sIds.slice(i, i + BATCH_SIZE));
  }

  logger.info(
    { batchCount: batches.length, batchSize: BATCH_SIZE, concurrency: 8 },
    "Processing sId batches concurrently"
  );

  const results = await concurrentExecutor(
    batches,
    async (sIdBatch, idx) => {
      const mcpServerViews = await MCPServerViewModel.findAll({
        where: {
          internalMCPServerId: { [Op.in]: sIdBatch },
        },
        includeDeleted: true,
      });

      if (mcpServerViews.length === 0) {
        return 0;
      }

      logger.info(
        {
          batchIndex: idx,
          foundViews: mcpServerViews.length,
          totalBatches: batches.length,
        },
        "Found MCPServerViews in batch"
      );

      await deleteRelatedRecordsForViews(mcpServerViews, execute, logger);
      return deleteMCPServerViews(mcpServerViews, execute, logger);
    },
    { concurrency: 8 }
  );

  const totalDeleted = results.reduce((sum, count) => sum + count, 0);

  logger.info(
    {
      totalSIds: sIds.length,
      totalDeleted,
      execute,
    },
    execute
      ? "MCPServerView deletion script completed"
      : "MCPServerView deletion script completed (dry run)"
  );
});
