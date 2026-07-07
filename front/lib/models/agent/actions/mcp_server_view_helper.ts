import type { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

export async function destroyMCPServerViewDependencies(
  auth: Authenticator,
  {
    mcpServerViewIds,
    transaction,
  }: {
    mcpServerViewIds: ModelId[];
    transaction?: Transaction;
  }
) {
  // Delete all dependencies.
  const agentConfigurationIds = (
    await AgentMCPServerConfigurationModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewIds,
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
      mcpServerViewId: mcpServerViewIds,
    },
    transaction,
  });

  await ConversationMCPServerViewModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewIds,
    },
    transaction,
  });

  await SkillMCPServerConfigurationModel.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewIds,
    },
    transaction,
  });

  // Sandbox-function tool calls FK the view with RESTRICT, so their rows must go before the view.
  // Routed through the resource so the output GCS objects are deleted alongside the rows.
  await SandboxFunctionMCPActionResource.deleteAllForMCPServerViews(auth, {
    mcpServerViewIds,
    transaction,
  });
}
