import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import type { ModelId } from "@app/types";

export const destroyMCPServerViewDependencies = async (
  auth: Authenticator,
  {
    mcpServerViewId,
    transaction,
  }: {
    mcpServerViewId: ModelId;
    transaction?: Transaction;
  }
) => {
  // Delete all dependencies.
  const agentConfigurationIds = (
    await AgentMCPServerConfigurationModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewId,
      },
      transaction,
    })
  ).map((view: AgentMCPServerConfigurationModel) => view.id);

  await AgentDataSourceConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentTablesQueryConfigurationTableModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentChildAgentConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });

  await ConversationMCPServerViewModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });

  await SkillMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });
};
