import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import trim from "lodash/trim";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { FIND_TAGS_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI, Err, Ok, removeNulls } from "@app/types";

const DEFAULT_SEARCH_LABELS_UPPER_LIMIT = 2000;

export const findTagsSchema = {
  query: z
    .string()
    .describe(
      "The text to search for in existing labels (also called tags) using edge ngram " +
        "matching (case-insensitive). Matches labels that start with any word in the " +
        "search text. The returned labels can be used in tagsIn/tagsNot parameters to " +
        "restrict or exclude content based on the user request and conversation context."
    ),
  dataSources:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
};

export function registerFindTagsTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined,
  { name, extraDescription }: { name: string; extraDescription?: string }
) {
  const baseDescription =
    `Find exact matching labels (also called tags).` +
    "Restricting or excluding content succeeds only with existing labels. " +
    "Searching without verifying labels first typically returns no results." +
    "The output of this tool can typically be used in `tagsIn` (if we want " +
    "to restrict the search to specific tags) or `tagsNot` (if we want to " +
    "exclude specific tags) parameters.";
  const toolDescription = extraDescription
    ? baseDescription + "\n" + extraDescription
    : baseDescription;

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
                  coreSearchArgsResults.map((res) =>
                    res.isErr() ? res.error : null
                  )
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
    )
  );
}
