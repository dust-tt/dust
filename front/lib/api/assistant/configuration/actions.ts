import assert from "assert";
import type { Transaction } from "sequelize";

import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import {
  AgentChildAgentConfiguration,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType, Result } from "@app/types";
import type { ReasoningModelConfigurationType } from "@app/types";
import { removeNulls } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Called by Agent Builder to create an action configuration.
 */
export async function createAgentActionConfiguration(
  auth: Authenticator,
  action: UnsavedMCPServerConfigurationType,
  agentConfiguration: LightAgentConfigurationType
): Promise<Result<MCPServerConfigurationType, Error>> {
  const owner = auth.getNonNullableWorkspace();

  assert(isServerSideMCPServerConfiguration(action));

  return withTransaction(async (t) => {
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      action.mcpServerViewId
    );
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found"));
    }

    const {
      server: { name: serverName, description: serverDescription },
    } = mcpServerView.toJSON();

    const mcpConfig = await AgentMCPServerConfiguration.create(
      {
        sId: generateRandomModelSId(),
        agentConfigurationId: agentConfiguration.id,
        workspaceId: owner.id,
        mcpServerViewId: mcpServerView.id,
        internalMCPServerId: mcpServerView.internalMCPServerId,
        additionalConfiguration: action.additionalConfiguration,
        timeFrame: action.timeFrame,
        jsonSchema: action.jsonSchema,
        name: serverName !== action.name ? action.name : null,
        singleToolDescriptionOverride:
          serverDescription !== action.description ? action.description : null,
        appId: action.dustAppConfiguration?.appId ?? null,
      },
      { transaction: t }
    );

    // Creating the AgentDataSourceConfiguration if configured
    if (action.dataSources) {
      await createAgentDataSourcesConfiguration(auth, t, {
        dataSourceConfigurations: action.dataSources,
        mcpServerConfiguration: mcpConfig,
      });
    }
    // Creating the AgentTablesQueryConfigurationTable if configured
    if (action.tables) {
      await createTableDataSourceConfiguration(auth, t, {
        tableConfigurations: action.tables,
        mcpConfig,
      });
    }
    // Creating the ChildAgentConfiguration if configured
    if (action.childAgentId) {
      await createChildAgentConfiguration(auth, t, {
        childAgentId: action.childAgentId,
        mcpConfig,
      });
    }
    // Creating the AgentReasoningConfiguration if configured
    if (action.reasoningModel) {
      await createReasoningConfiguration(auth, t, {
        reasoningModel: action.reasoningModel,
        mcpConfig,
        agentConfiguration,
      });
    }

    return new Ok({
      id: mcpConfig.id,
      sId: mcpConfig.sId,
      type: "mcp_server_configuration",
      name: action.name,
      description: action.description,
      mcpServerViewId: action.mcpServerViewId,
      internalMCPServerId: action.internalMCPServerId,
      dataSources: action.dataSources,
      tables: action.tables,
      childAgentId: action.childAgentId,
      reasoningModel: action.reasoningModel,
      timeFrame: action.timeFrame,
      additionalConfiguration: action.additionalConfiguration,
      dustAppConfiguration: action.dustAppConfiguration,
      jsonSchema: action.jsonSchema,
    });
  });
}

/**
 * Create the AgentDataSourceConfiguration rows in the database.
 *
 * Knowing that a datasource is uniquely identified by its name and its workspaceId
 * We need to fetch the dataSources from the database from that.
 * We obviously need to do as few queries as possible.
 */
async function createAgentDataSourcesConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    dataSourceConfigurations,
    mcpServerConfiguration,
  }: {
    dataSourceConfigurations: DataSourceConfiguration[];
    mcpServerConfiguration: AgentMCPServerConfiguration | null;
  }
): Promise<AgentDataSourceConfiguration[]> {
  const owner = auth.getNonNullableWorkspace();

  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(
    dataSourceConfigurations.every((dsc) => dsc.workspaceId === owner.sId)
  );

  // DataSourceViewResource.listByWorkspace() applies the permissions check.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  const dataSourceViewsMap = dataSourceViews.reduce(
    (acc, dsv) => {
      acc[dsv.sId] = dsv;
      return acc;
    },
    {} as Record<string, DataSourceViewResource>
  );

  const agentDataSourceConfigBlobs = removeNulls(
    dataSourceConfigurations.map((dsConfig) => {
      const dataSourceView = dataSourceViewsMap[dsConfig.dataSourceViewId];
      if (!dataSourceView) {
        logger.warn(
          {
            dataSourceViewId: dsConfig.dataSourceViewId,
          },
          "createAgentDataSourcesConfiguration: skip dataSourceView not found"
        );
        return null;
      }

      const tagsFilter = dsConfig.filter.tags;
      let tagsMode: "auto" | "custom" | null = null;
      let tagsIn: string[] | null = null;
      let tagsNotIn: string[] | null = null;

      if (tagsFilter?.mode === "auto") {
        tagsMode = "auto";
        tagsIn = tagsFilter.in ?? [];
        tagsNotIn = tagsFilter.not ?? [];
      } else if (tagsFilter?.mode === "custom") {
        tagsMode = "custom";
        tagsIn = tagsFilter.in ?? [];
        tagsNotIn = tagsFilter.not ?? [];
      }

      return {
        dataSourceId: dataSourceView.dataSource.id,
        parentsIn: dsConfig.filter.parents?.in,
        parentsNotIn: dsConfig.filter.parents?.not,
        dataSourceViewId: dataSourceView.id,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        mcpServerConfigurationId: mcpServerConfiguration?.id || null,
        tagsMode,
        tagsIn,
        tagsNotIn,
        workspaceId: owner.id,
      };
    })
  );

  return AgentDataSourceConfiguration.bulkCreate(agentDataSourceConfigBlobs, {
    transaction: t,
  });
}

async function createTableDataSourceConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    tableConfigurations,
    mcpConfig,
  }: {
    tableConfigurations: TableDataSourceConfiguration[];
    mcpConfig: AgentMCPServerConfiguration;
  }
) {
  const owner = auth.getNonNullableWorkspace();
  // Although we have the capability to support multiple workspaces,
  // currently, we only support one workspace, which is the one the user is in.
  // This allows us to use the current authenticator to fetch resources.
  assert(tableConfigurations.every((tc) => tc.workspaceId === owner.sId));

  // DataSourceViewResource.listByWorkspace() applies the permissions check.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  const dataSourceViewsMap = dataSourceViews.reduce(
    (acc, dsv) => {
      acc[dsv.sId] = dsv;
      return acc;
    },
    {} as Record<string, DataSourceViewResource>
  );

  const tableConfigBlobs = removeNulls(
    tableConfigurations.map((tc) => {
      const dataSourceView = dataSourceViewsMap[tc.dataSourceViewId];
      if (!dataSourceView) {
        logger.warn(
          {
            dataSourceViewId: tc.dataSourceViewId,
          },
          "createTableDataSourceConfiguration: skip dataSourceView not found"
        );
        return null;
      }

      const { dataSource } = dataSourceView;

      return {
        dataSourceId: dataSource.id,
        dataSourceViewId: dataSourceView.id,
        tableId: tc.tableId,
        mcpServerConfigurationId: mcpConfig.id,
        workspaceId: owner.id,
      };
    })
  );

  return AgentTablesQueryConfigurationTable.bulkCreate(tableConfigBlobs, {
    transaction: t,
  });
}

async function createChildAgentConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    childAgentId,
    mcpConfig,
  }: {
    childAgentId: string;
    mcpConfig: AgentMCPServerConfiguration;
  }
) {
  return AgentChildAgentConfiguration.create(
    {
      agentConfigurationId: childAgentId,
      mcpServerConfigurationId: mcpConfig.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    { transaction: t }
  );
}

async function createReasoningConfiguration(
  auth: Authenticator,
  t: Transaction,
  {
    reasoningModel,
    mcpConfig,
    agentConfiguration,
  }: {
    reasoningModel: ReasoningModelConfigurationType;
    mcpConfig: AgentMCPServerConfiguration;
    agentConfiguration: LightAgentConfigurationType;
  }
) {
  return AgentReasoningConfiguration.create(
    {
      sId: generateRandomModelSId(),
      mcpServerConfigurationId: mcpConfig.id,
      providerId: reasoningModel.providerId,
      modelId: reasoningModel.modelId,
      temperature: agentConfiguration.model.temperature,
      reasoningEffort: reasoningModel.reasoningEffort,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    { transaction: t }
  );
}
