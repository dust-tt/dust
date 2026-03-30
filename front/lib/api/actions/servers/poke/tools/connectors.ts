import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  CHECK_NOTION_PAGE_TOOL_NAME,
  CHECK_SLACK_CHANNEL_TOOL_NAME,
  GET_CONNECTOR_DETAILS_TOOL_NAME,
  LIST_DATA_SOURCES_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getTemporalClientForConnectorsNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI } from "@app/types/core/core_api";
import { Err } from "@app/types/shared/result";

type ConnectorHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  | typeof LIST_DATA_SOURCES_TOOL_NAME
  | typeof GET_CONNECTOR_DETAILS_TOOL_NAME
  | typeof CHECK_NOTION_PAGE_TOOL_NAME
  | typeof CHECK_SLACK_CHANNEL_TOOL_NAME
>;

export const connectorHandlers: ConnectorHandlers = {
  [LIST_DATA_SOURCES_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      LIST_DATA_SOURCES_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }

    const dataSources = await DataSourceResource.listByWorkspace(
      targetAuthResult.value,
      { includeEditedBy: true }
    );

    return jsonResponse({
      workspace_id,
      count: dataSources.length,
      dataSources: dataSources.map((ds) => ds.toJSON()),
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}`,
    });
  },

  [GET_CONNECTOR_DETAILS_TOOL_NAME]: async (
    { workspace_id, data_source_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_CONNECTOR_DETAILS_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuth = await getTargetAuth(workspace_id);
    if (targetAuth.isErr()) {
      return targetAuth;
    }
    const targetAuthResult = targetAuth.value;

    const dataSource = await DataSourceResource.fetchById(
      targetAuthResult,
      data_source_id,
      { includeEditedBy: true }
    );
    if (!dataSource) {
      return new Err(
        new MCPError(
          `Data source "${data_source_id}" not found in workspace "${workspace_id}".`,
          { tracked: false }
        )
      );
    }

    // Fetch core data source info.
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const coreDataSourceRes = await coreAPI.getDataSource({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
    });

    const dataSourceViews = await DataSourceViewResource.listForDataSources(
      targetAuthResult,
      [dataSource]
    );

    // Fetch connector info and Temporal workflows if this is a managed data source.
    let connector = null;
    const temporalWorkflows: {
      workflowId: string;
      runId: string;
      status: string;
    }[] = [];

    if (dataSource.connectorId) {
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connectorRes = await connectorsAPI.getConnector(
        dataSource.connectorId
      );
      if (connectorRes.isOk()) {
        connector = connectorRes.value;
        const temporalClient = await getTemporalClientForConnectorsNamespace();
        const workflowsIter = temporalClient.workflow.list({
          query: `ExecutionStatus = 'Running' AND connectorId = ${connector.id}`,
        });
        for await (const infos of workflowsIter) {
          temporalWorkflows.push({
            workflowId: infos.workflowId,
            runId: infos.runId,
            status: infos.status.name,
          });
        }
      }
    }

    return jsonResponse({
      dataSource: dataSource.toJSON(),
      dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
      coreDataSource: coreDataSourceRes.isOk()
        ? coreDataSourceRes.value.data_source
        : null,
      connector,
      temporalRunningWorkflows: temporalWorkflows,
      poke_url: `${config.getPokeAppUrl()}/${workspace_id}/data_sources/${data_source_id}`,
    });
  },

  [CHECK_NOTION_PAGE_TOOL_NAME]: async (
    { workspace_id, data_source_id, url },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      CHECK_NOTION_PAGE_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const result = await connectorsAPI.admin({
      majorCommand: "notion",
      command: "check-url",
      args: { wId: workspace_id, dsId: data_source_id, url },
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Notion check failed: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    return jsonResponse({
      workspace_id,
      data_source_id,
      url,
      result: result.value,
    });
  },

  [CHECK_SLACK_CHANNEL_TOOL_NAME]: async (
    { workspace_id, channel_id },
    extra
  ) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      CHECK_SLACK_CHANNEL_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const result = await connectorsAPI.admin({
      majorCommand: "slack",
      command: "check-channel",
      args: { wId: workspace_id, channelId: channel_id.trim() },
    });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Slack channel check failed: ${result.error.message}`, {
          tracked: false,
        })
      );
    }

    return jsonResponse({
      workspace_id,
      channel_id,
      result: result.value,
    });
  },
};
