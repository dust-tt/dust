import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { trim } from "lodash";
import { z } from "zod";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getCoreSearchArgs,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
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
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

const DEFAULT_SEARCH_LABELS_LIMIT = 10;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "search",
  version: "1.0.0",
  description: "Search through selected Data sources (mcp)",
  icon: "ActionMagnifyingGlassIcon",
  authorization: null,
  documentationUrl: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  const commonInputsSchema = {
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
    dataSources:
      ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE],
  };

  const tagsInputSchema = {
    tagsIn: z
      .array(z.string())
      .describe(
        "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
          "If multiple labels are provided, the search will return documents that have at least one of the labels." +
          "You can't check that all labels are present, only that at least one is present." +
          "If no labels are provided, the search will return all documents regardless of their labels."
      ),
    tagsNot: z
      .array(z.string())
      .describe(
        "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
          "Any document having one of these labels will be excluded from the search."
      ),
  };

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  const searchFunction = async ({
    query,
    relativeTimeFrame,
    dataSources,
    tagsIn,
    tagsNot,
  }: {
    query: string;
    relativeTimeFrame: string;
    dataSources: DataSourcesToolConfigurationType;
    tagsIn?: string[];
    tagsNot?: string[];
  }): Promise<CallToolResult> => {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const credentials = dustManagedCredentials();
    const timeFrame = parseTimeFrame(relativeTimeFrame);

    if (!agentLoopContext?.runContext) {
      throw new Error(
        "agentLoopRunContext is required where the tool is called."
      );
    }

    // Compute the topK and refsOffset for the search.
    const topK = getRetrievalTopK({
      agentConfiguration: agentLoopContext.runContext.agentConfiguration,
      stepActions: agentLoopContext.runContext.stepActions,
    });
    const refsOffset = actionRefsOffset({
      agentConfiguration: agentLoopContext.runContext.agentConfiguration,
      stepActionIndex: agentLoopContext.runContext.stepActionIndex,
      stepActions: agentLoopContext.runContext.stepActions,
      refsOffset: agentLoopContext.runContext.citationsRefsOffset,
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

    if (coreSearchArgs.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Search action must have at least one data source configured.",
          },
        ],
      };
    }

    // Now we can search each data source.
    const searchResults = await coreAPI.searchDataSources(
      query,
      topK,
      credentials,
      false,
      coreSearchArgs.map((args) => {
        // In addition to the tags provided by the user, we also add the tags that the model inferred
        // from the conversation history.
        const finalTagsIn = [
          ...(args.filter.tags?.in ?? []),
          ...(tagsIn ?? []),
        ];
        const finalTagsNot = [
          ...(args.filter.tags?.not ?? []),
          ...(tagsNot ?? []),
        ];

        return {
          projectId: args.projectId,
          dataSourceId: args.dataSourceId,
          filter: {
            ...args.filter,
            tags: {
              in: finalTagsIn.length > 0 ? finalTagsIn : null,
              not: finalTagsNot.length > 0 ? finalTagsNot : null,
            },
            timestamp: {
              gt: timeFrame ? timeFrameFromNow(timeFrame) : null,
              lt: null,
            },
          },
          view_filter: args.view_filter,
        };
      })
    );

    if (searchResults.isErr()) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: searchResults.error.message,
          },
        ],
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

    const results: SearchResultResourceType[] =
      searchResults.value.documents.map((doc) => {
        const dataSourceView = coreSearchArgs.find(
          (args) =>
            args.dataSourceView.dataSource.dustAPIDataSourceId ===
            doc.data_source_id
        )?.dataSourceView;

        assert(dataSourceView, "DataSource view not found");

        return {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
          uri: doc.source_url ?? "",
          text: getDisplayNameForDocument(doc),

          id: doc.document_id,
          source: {
            provider: dataSourceView.dataSource.connectorProvider ?? undefined,
            name: getDataSourceNameFromView(dataSourceView),
          },
          tags: doc.tags,
          ref: refs.shift() as string,
          chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
        };
      });

    return {
      isError: false,
      content: [
        ...results.map((result) => ({
          type: "resource" as const,
          resource: result,
        })),
        {
          type: "resource" as const,
          resource: makeQueryResource(query, timeFrame, tagsIn, tagsNot),
        },
      ],
    };
  };

  if (!areTagsDynamic) {
    server.tool(
      "semantic_search",
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      commonInputsSchema,
      searchFunction
    );
  } else {
    server.tool(
      "semantic_search",
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      {
        ...commonInputsSchema,
        ...tagsInputSchema,
      },
      searchFunction
    );

    server.tool(
      "find_tags",
      "Find exact matching labels (also called tags) before using them in the tool `semantic_search`." +
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

        if (coreSearchArgs.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Search action must have at least one data source configured.",
              },
            ],
          };
        }

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
  }

  return server;
}

function makeQueryResource(
  query: string,
  relativeTimeFrame: TimeFrame | null,
  tagsIn?: string[],
  tagsNot?: string[]
): SearchQueryResourceType {
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

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: query
      ? `Searching "${query}", ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`
      : `Searching ${timeFrameAsString}${tagsInAsString}${tagsNotAsString}.`,
    uri: "",
  };
}

export default createServer;
