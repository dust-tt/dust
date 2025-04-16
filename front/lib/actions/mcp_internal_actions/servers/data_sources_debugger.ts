import {
  DATA_SOURCE_CONFIGURATION_URI_PATTERN,
  INTERNAL_MIME_TYPES,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "data_sources_debugger",
  version: "1.0.0",
  description:
    "Demo server showing a basic interaction with a data source configuration.",
  visual: "https://dust.tt/static/droidavatar/Droid_Yellow_3.jpg",
  authorization: null,
};

async function fetchAgentDataSourceConfiguration(
  uri: string
): Promise<Result<AgentDataSourceConfiguration | null, Error>> {
  const match = uri.match(DATA_SOURCE_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a data source configuration: ${uri}`)
    );
  }

  // It's safe to do this because the inputs are already checked against the zod schema here.
  const [, , dataSourceConfigId] = match;
  const sIdParts = getResourceNameAndIdFromSId(dataSourceConfigId);
  if (!sIdParts) {
    return new Err(
      new Error(`Invalid data source configuration ID: ${dataSourceConfigId}`)
    );
  }
  if (sIdParts.resourceName !== "data_source_configuration") {
    return new Err(
      new Error(
        `ID is not a data source configuration ID: ${dataSourceConfigId}`
      )
    );
  }

  const agentDataSourceConfiguration =
    await AgentDataSourceConfiguration.findByPk(sIdParts.resourceId, {
      nest: true,
      include: [{ model: DataSourceModel, as: "dataSource", required: true }],
    });

  if (
    agentDataSourceConfiguration &&
    agentDataSourceConfiguration.workspaceId !== sIdParts.workspaceId
  ) {
    return new Err(
      new Error(
        `Data source configuration ${dataSourceConfigId} does not belong to workspace ${sIdParts.workspaceId}`
      )
    );
  }

  return new Ok(agentDataSourceConfiguration);
}

function createServer(): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "show_data_source_names",
    "Shows the names of the data sources available.",
    {
      query: z.string(),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ dataSources }) => {
      const agentDataSourceConfigurations = await concurrentExecutor(
        dataSources,
        async ({ uri }) => fetchAgentDataSourceConfiguration(uri),
        { concurrency: 10 }
      );
      if (agentDataSourceConfigurations.some((res) => res.isErr())) {
        return {
          isError: true,
          content: agentDataSourceConfigurations
            .filter((res) => res.isErr())
            .map((res) => ({
              type: "text",
              text: res.isErr() ? res.error.message : "unknown error",
            })),
        };
      }
      return {
        isError: false,
        content: agentDataSourceConfigurations.map((res) => ({
          type: "text",
          text: (res.isOk() && res.value?.dataSource?.name) || "unknown",
        })),
      };
    }
  );

  return server;
}

export default createServer;
