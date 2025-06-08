import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { trim } from "lodash";
import { z } from "zod";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  IncludeQueryResourceType,
  IncludeResultResourceType,
  WarningResourceType,
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
import type { CoreAPIDocument, TimeFrame } from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  removeNulls,
  timeFrameFromNow,
} from "@app/types";

const DEFAULT_SEARCH_LABELS_LIMIT = 10;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "include_data",
  version: "1.0.0",
  description: "Include data exhaustively (mcp)",
  icon: "ActionTimeIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  const commonInputsSchema = {
    timeFrame:
      ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
      ],
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

  const includeFunction = async ({
    timeFrame,
    dataSources,
    tagsIn,
    tagsNot,
  }: {
    timeFrame: TimeFrame | null;
    dataSources: DataSourcesToolConfigurationType;
    tagsIn?: string[];
    tagsNot?: string[];
  }): Promise<{
    isError: boolean;
    content:
      | TextContent[]
      | {
          type: "resource";
          resource:
            | IncludeResultResourceType
            | IncludeQueryResourceType
            | WarningResourceType;
        }[];
  }> => {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const credentials = dustManagedCredentials();

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

    const searchResults = await coreAPI.searchDataSources(
      "",
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
            text: "The inclusion exhausted the total number of references available for citations",
          },
        ],
      };
    }

    const refs = getRefs().slice(refsOffset, refsOffset + topK);

    const results: IncludeResultResourceType[] =
      searchResults.value.documents.map((doc) => {
        const dataSourceView = coreSearchArgs.find(
          (args) =>
            args.dataSourceView.dataSource.dustAPIDataSourceId ===
            doc.data_source_id
        )?.dataSourceView;

        assert(dataSourceView, "DataSource view not found");

        return {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_RESULT,
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
        };
      });

    const warningResource = makeWarningResource(
      searchResults.value.documents,
      topK,
      timeFrame ?? null
    );

    return {
      isError: false,
      content: [
        ...results.map((result) => ({
          type: "resource" as const,
          resource: result,
        })),
        {
          type: "resource" as const,
          resource: makeQueryResource(timeFrame ?? null),
        },
        ...(warningResource
          ? [
              {
                type: "resource" as const,
                resource: warningResource,
              },
            ]
          : []),
      ],
    };
  };

  if (!areTagsDynamic) {
    server.tool(
      "retrieve_recent_documents",
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
      commonInputsSchema,
      includeFunction
    );
  } else {
    server.tool(
      "retrieve_recent_documents",
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
      {
        ...commonInputsSchema,
        ...tagsInputSchema,
      },
      includeFunction
    );

    server.tool(
      "search_labels",
      "Find exact matching labels (also called tags) before using them in the tool `retrieve_recent_documents`" +
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
  timeFrame: TimeFrame | null
): IncludeQueryResourceType {
  const timeFrameAsString = timeFrame
    ? "over the last " +
      (timeFrame.duration > 1
        ? `${timeFrame.duration} ${timeFrame.unit}s.`
        : `${timeFrame.unit}.`)
    : "over all time.";

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_QUERY,
    text: `Requested to include documents ${timeFrameAsString}.`,
    uri: "",
  };
}

function makeWarningResource(
  documents: CoreAPIDocument[],
  topK: number,
  timeFrame: TimeFrame | null
): WarningResourceType | null {
  const timeFrameAsString = timeFrame
    ? "over the last " +
      (timeFrame.duration > 1
        ? `${timeFrame.duration} ${timeFrame.unit}s.`
        : `${timeFrame.unit}.`)
    : "over all time.";

  // Check if the number of chunks reached the limit defined in params.topK.
  const tooManyChunks =
    documents &&
    documents.reduce((sum, doc) => sum + doc.chunks.length, 0) >= topK;

  // Determine the retrieval date limit from the last document's timestamp.
  const retrievalTsLimit = documents?.[documents.length - 1]?.timestamp;
  const date = retrievalTsLimit ? new Date(retrievalTsLimit) : null;
  const retrievalDateLimitAsString = date
    ? `${date.toLocaleString("default", { month: "short" })} ${date.getDate()}`
    : null;

  return tooManyChunks
    ? {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WARNING,
        warningTitle: `Only includes documents since ${retrievalDateLimitAsString}.`,
        warningData: { includeTimeLimit: retrievalDateLimitAsString ?? "" },
        text: `Warning: could not include all documents ${timeFrameAsString}. Only includes documents since ${retrievalDateLimitAsString}.`,
        uri: "",
      }
    : null;
}

export default createServer;
