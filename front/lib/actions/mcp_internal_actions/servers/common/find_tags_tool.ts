import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import trim from "lodash/trim";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { FIND_TAGS_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { CoreAPI, Err, removeNulls } from "@app/types";
import { Ok } from "@app/types";

const DEFAULT_SEARCH_LABELS_LIMIT = 10;

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

export const makeFindTagsDescription = (toolName: string) =>
  `Find exact matching labels (also called tags) before using them in the tool ${toolName}.` +
  "Restricting or excluding content succeeds only with existing labels. " +
  "Searching without verifying labels first typically returns no results.";

export function makeFindTagsTool(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
  return withToolLogging(
    auth,
    { toolName: FIND_TAGS_TOOL_NAME, agentLoopContext },
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
            "Search action must have at least one data source configured."
          )
        );
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const result = await coreAPI.searchTags({
        dataSourceViews: coreSearchArgs.map((arg) => arg.dataSourceView),
        limit: DEFAULT_SEARCH_LABELS_LIMIT,
        query,
        queryType: "match",
      });

      if (result.isErr()) {
        return new Err(new MCPError("Error searching for labels"));
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
  );
}
