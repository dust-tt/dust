import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { fetchAgentDataSourceConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI, removeNulls } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "content_nodes",
  version: "1.0.0",
  description: "Tools to browse and search within the content nodes hierarchy.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "search_by_title",
    `List all nodes whose title match the query title. This is the equivalent of a find -name in Unix.
    It operates on the content node hierarchy.`,
    {
      query: z.string().describe(
        `The title to search for. This query parameter supports prefix-based search.
          For instance, if the title is "Hello World", the query "Hello" will return the node "Hello World".`
      ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
      limit: z
        .number()
        .optional()
        .describe("Maximum number of nodes to retrieve."),
    },
    async ({ query, dataSources, limit }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const agentDataSourceConfigurationsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          fetchAgentDataSourceConfiguration(dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (agentDataSourceConfigurationsResults.some((res) => res.isErr())) {
        return makeMCPToolTextError(
          "Failed to fetch data source configurations."
        );
      }

      const agentDataSourceConfigurations = removeNulls(
        agentDataSourceConfigurationsResults.map((res) =>
          res.isOk() ? res.value : null
        )
      );

      const searchResult = await coreAPI.searchNodes({
        query,
        filter: {
          data_source_views: agentDataSourceConfigurations.map(
            ({ dataSource, dataSourceView }) => ({
              data_source_id: dataSource.dustAPIDataSourceId,
              view_filter: dataSourceView.parentsIn ?? [],
            })
          ),
        },
        options: {
          limit,
        },
      });

      if (searchResult.isErr()) {
        return makeMCPToolTextError("Failed to search nodes");
      }

      return makeMCPToolJSONSuccess({
        message: "Search successful.",
        result: searchResult.value,
      });
    }
  );

  return server;
};

export default createServer;
