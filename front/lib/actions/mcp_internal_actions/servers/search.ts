import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { trim } from "lodash";
import { z } from "zod";

import {
  ConfigurableToolInputSchemas,
  isDataSourcesToolConfiguration,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { SearchQueryResourceMimeType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import {
  getDataSourceNameFromView,
  getDisplayNameForDocument,
} from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { TimeFrame } from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  parseTimeFrame,
  removeNulls,
  timeFrameFromNow,
} from "@app/types";

const DEFAULT_SEARCH_LABELS_LIMIT = 10;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "search",
  version: "1.0.0",
  description: "Search through selected Data sources (mcp)",
  icon: "ActionMagnifyingGlassIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "search_data_sources",
    "Search the data sources specified by the user." +
      " The search is based on semantic similarity between the query and chunks of information" +
      " from the data sources.",
    {
      query: z
        .string()
        .describe(
          "The string used to retrieve relevant chunks of information using semantic similarity" +
            " based on the user request and conversation context." +
            " Include as much semantic signal based on the entire conversation history," +
            " paraphrasing if necessary. longer queries are generally better."
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .describe(
          "The time frame (relative to LOCAL_TIME) to restrict the search based" +
            " on the user request and past conversation context." +
            " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
            " where {k} is a number. Be strict, do not invent invalid values."
        ),
      tagsIn: z
        .array(z.string())
        .describe(
          "An optional list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
            "If multiple labels are provided, the search will return documents that have at least one of the labels." +
            "You can't check that all labels are present, only that at least one is present." +
            "If no labels are provided, the search will return all documents regardless of their labels."
        )
        .optional(),
      tagsNot: z
        .array(z.string())
        .describe(
          "An optional list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
            "Any document having one of these labels will be excluded from the search."
        )
        .optional(),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ query, relativeTimeFrame, dataSources, tagsIn, tagsNot }) => {
      if (!isDataSourcesToolConfiguration(dataSources)) {
        return {
          isError: true,
          content: [{ type: "text", text: "Invalid data sources" }],
        };
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const credentials = dustManagedCredentials();
      const timeFrame = parseTimeFrame(relativeTimeFrame);

      if (!agentLoopContext) {
        throw new Error(
          "agentLoopContext is required where the tool is called."
        );
      }

      // Compute the topK and refsOffset for the search.
      const topK = getRetrievalTopK({
        agentConfiguration: agentLoopContext.agentConfiguration,
        stepActions: agentLoopContext.stepActions,
      });
      const refsOffset = actionRefsOffset({
        agentConfiguration: agentLoopContext.agentConfiguration,
        stepActionIndex: agentLoopContext.stepActionIndex,
        stepActions: agentLoopContext.stepActions,
        refsOffset: agentLoopContext.citationsRefsOffset,
      });

      // Get the core search args for each data source, fail if any of them are invalid.
      const coreSearchArgsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          getCoreSearchArgs(auth, dataSourceConfiguration),
        { concurrency: 10 }
      );

      // If any of the data sources are invalid, return an error message.
      if (coreSearchArgsResults.some((res) => res.isErr())) {
        return {
          isError: false,
          content: removeNulls(
            coreSearchArgsResults.map((res) => (res.isErr() ? res.error : null))
          ).map((error) => ({
            type: "text",
            text: error.message,
          })),
        };
      }

      const coreSearchArgs = removeNulls(
        coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
      );

      // Now we can search each data source.
      const searchResults = await concurrentExecutor(
        coreSearchArgs,
        async (searchArgs) => {
          // In addition to the tags provided by the user, we also add the tags that the model inferred
          // from the conversation history.
          const finalTagsIn = [
            ...(searchArgs.filter.tags?.in ?? []),
            ...(tagsIn ?? []),
          ];
          const finalTagsNot = [
            ...(searchArgs.filter.tags?.not ?? []),
            ...(tagsNot ?? []),
          ];

          return coreAPI.searchDataSource(
            searchArgs.projectId,
            searchArgs.dataSourceId,
            {
              query,
              topK: topK,
              credentials,
              fullText: false,
              filter: {
                ...searchArgs.filter,
                tags: {
                  in: finalTagsIn.length > 0 ? finalTagsIn : null,
                  not: finalTagsNot.length > 0 ? finalTagsNot : null,
                },
                timestamp: {
                  gt: timeFrame ? timeFrameFromNow(timeFrame) : null,
                  lt: null,
                },
              },
              view_filter: searchArgs.view_filter,
            }
          );
        },
        { concurrency: 10 }
      );

      // If any of the search results are invalid, return an error message.
      if (searchResults.some((res) => res.isErr())) {
        return {
          isError: true,
          content: removeNulls(
            searchResults.map((res) => (res.isErr() ? res.error : null))
          ).map((error) => ({
            type: "text",
            text: error.message,
          })),
        };
      }

      if (refsOffset + topK > getRefs().length) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "The search exhausted the total number of references available for citations",
            },
          ],
        };
      }

      const refs = getRefs().slice(refsOffset, refsOffset + topK);

      const results: SearchResultResourceType[] = removeNulls(
        searchResults.map((res) => (res.isOk() ? res.value : null))
      ).flatMap((res) => {
        if (res.documents.length === 0) {
          return [];
        }

        const firstDocument = res.documents[0];

        const dataSourceView = coreSearchArgs.find(
          (args) =>
            args.dataSourceView.dataSource.dustAPIDataSourceId ===
            firstDocument?.data_source_id
        )?.dataSourceView;

        assert(dataSourceView, "DataSource view not found");

        return res.documents.map((doc) => ({
          mimeType: "application/vnd.dust.search_result",
          uri: doc.source_url ?? "",
          text: getDisplayNameForDocument(doc),

          id: doc.document_id,
          source: {
            provider: dataSourceView.dataSource.connectorProvider ?? undefined,
            name: getDataSourceNameFromView(dataSourceView),
          },
          tags: doc.tags,
          ref: refs.shift() as string,
          chunks: doc.chunks.map((chunk) => chunk.text),
        }));
      });

      const queryResource: SearchQueryResourceType = {
        mimeType: SearchQueryResourceMimeType,
        text: makeQueryDescription(query, timeFrame, tagsIn, tagsNot),
        uri: "",
      };

      return {
        isError: false,
        content: [
          ...results.map((result) => ({
            type: "resource" as const,
            resource: result,
          })),
          {
            type: "resource" as const,
            resource: queryResource,
          },
        ],
      };
    }
  );

  server.tool(
    "search_labels",
    "Find exact matching labels (also called tags) before using them in the tool `search_data_sources`" +
      "Restricting or excluding content succeeds only with existing labels. " +
      "Searching without verifying labels first typically returns no results.",
    {
      query: z
        .string()
        .describe(
          "The text to search for in existing labels (also called tags) using edge ngram matching (case-insensitive). " +
            "Matches labels that start with any word in the search text. " +
            "The returned labels can be used in tagsIn/tagsNot parameters to restrict or exclude content " +
            "based on the user request and conversation context."
        ),
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ query, dataSources }) => {
      if (!isDataSourcesToolConfiguration(dataSources)) {
        return {
          isError: true,
          content: [{ type: "text", text: "Invalid data sources" }],
        };
      }

      // Get the core search args for each data source, fail if any of them are invalid.
      const coreSearchArgsResults = await concurrentExecutor(
        dataSources,
        async (dataSourceConfiguration) =>
          getCoreSearchArgs(auth, dataSourceConfiguration),
        { concurrency: 10 }
      );

      if (coreSearchArgsResults.some((res) => res.isErr())) {
        return {
          isError: true,
          content: [{ type: "text", text: "Invalid data sources" }],
        };
      }

      const coreSearchArgs = removeNulls(
        coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
      );

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const result = await coreAPI.searchTags({
        dataSourceViews: coreSearchArgs.map((arg) => arg.dataSourceView),
        limit: DEFAULT_SEARCH_LABELS_LIMIT,
        query,
        queryType: "match",
      });

      if (result.isErr()) {
        return {
          isError: true,
          content: [{ type: "text", text: "Error searching for labels" }],
        };
      }

      return {
        isError: false,
        content: [
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
        ],
      };
    }
  );

  return server;
}

function makeQueryDescription(
  query: string,
  relativeTimeFrame: TimeFrame | null,
  tagsIn?: string[],
  tagsNot?: string[]
) {
  const timeFrameAsString = relativeTimeFrame
    ? "over the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "across all time periods";
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  if (!query) {
    return `Searching ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
  }

  return `Searching "${query}", ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`;
}

export default createServer;
