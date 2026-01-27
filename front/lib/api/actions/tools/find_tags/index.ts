import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import trim from "lodash/trim";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  FIND_TAGS_BASE_DESCRIPTION,
  FIND_TAGS_TOOL_NAME,
  findTagsSchema,
} from "@app/lib/api/actions/tools/find_tags/metadata";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

const DEFAULT_SEARCH_LABELS_UPPER_LIMIT = 2000;

export async function executeFindTags(
  auth: Authenticator,
  query: string,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<TextContent[], MCPError>> {
  const coreSearchArgsResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) =>
      getCoreSearchArgs(auth, dataSourceConfiguration),
    { concurrency: 10 }
  );

  if (coreSearchArgsResults.some((res) => res.isErr())) {
    return new Err(
      new MCPError(
        "Invalid data sources: " +
          removeNulls(
            coreSearchArgsResults.map((res) => (res.isErr() ? res.error : null))
          )
            .map((error) => error.message)
            .join("\n")
      )
    );
  }

  const coreSearchArgs = removeNulls(
    coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
  );

  if (coreSearchArgs.length === 0) {
    return new Err(
      new MCPError(
        "Search action must have at least one data source configured.",
        {
          tracked: false,
        }
      )
    );
  }

  const dataSourceViews = coreSearchArgs.map((arg) => arg.dataSourceView);

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  let result = await coreAPI.searchTags({
    dataSourceViews,
    query,
    queryType: "match",
  });

  if (result.isErr()) {
    return new Err(new MCPError("Error searching for labels"));
  }

  if (result.value.tags.length === 0) {
    // Performing an additional search with a higher limit to catch uncommon tags.
    result = await coreAPI.searchTags({
      dataSourceViews,
      limit: DEFAULT_SEARCH_LABELS_UPPER_LIMIT,
      query,
      queryType: "match",
    });

    if (result.isErr()) {
      return new Err(new MCPError("Error searching for labels"));
    }
  }

  if (result.value.tags.length === 0) {
    return new Ok([
      {
        type: "text",
        text: "No labels found matching the search criteria.",
      },
    ]);
  }

  return new Ok([
    {
      type: "text",
      text:
        "Labels found:\n\n" +
        removeNulls(
          result.value.tags.map((tag) =>
            tag.tag && trim(tag.tag)
              ? `${tag.tag} (${tag.match_count} matches)`
              : null
          )
        ).join("\n"),
    },
  ]);
}

export function registerFindTagsTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  { name, extraDescription }: { name: string; extraDescription?: string }
) {
  const toolDescription = extraDescription
    ? FIND_TAGS_BASE_DESCRIPTION + "\n" + extraDescription
    : FIND_TAGS_BASE_DESCRIPTION;

  server.tool(
    name,
    toolDescription,
    findTagsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FIND_TAGS_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({
        query,
        dataSources,
      }: {
        query: string;
        dataSources: DataSourcesToolConfigurationType[number][];
      }) => {
        return executeFindTags(auth, query, dataSources);
      }
    )
  );
}
