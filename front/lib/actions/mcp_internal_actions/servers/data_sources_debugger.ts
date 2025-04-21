import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { fetchAgentDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "data_sources_debugger",
  version: "1.0.0",
  description:
    "Demo server showing a basic interaction with a data source configuration.",
  icon: "ActionCloudArrowLeftRightIcon",
  authorization: null,
};

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
        async (dataSources) => fetchAgentDataSourceConfiguration(dataSources),
        { concurrency: 10 }
      );
      if (agentDataSourceConfigurations.some((res) => res.isErr())) {
        return {
          isError: false,
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
          text: (res.isOk() && res.value.dataSource.name) || "unknown",
        })),
      };
    }
  );

  return server;
}

export default createServer;
