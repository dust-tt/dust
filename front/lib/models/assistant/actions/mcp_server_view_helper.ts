import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
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
  // TODO(mcp) add table datasources etc when they are implemented in AB
  const agentConfigurationIds = (
    await AgentMCPServerConfiguration.findAll({
      attributes: ["id"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        mcpServerViewId: mcpServerViewId,
      },
      transaction,
    })
  ).map((view: AgentMCPServerConfiguration) => view.id);

  await AgentDataSourceConfiguration.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentTablesQueryConfigurationTable.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentChildAgentConfiguration.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerConfigurationId: {
        [Op.in]: agentConfigurationIds,
      },
    },
    transaction,
  });

  await AgentMCPServerConfiguration.destroy({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      mcpServerViewId: mcpServerViewId,
    },
    transaction,
  });
};
