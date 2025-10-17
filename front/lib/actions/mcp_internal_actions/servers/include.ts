import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  IncludeQueryResourceType,
  IncludeResultResourceType,
  WarningResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderRelativeTimeFrameForToolOutput } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  FIND_TAGS_TOOL_NAME,
  INCLUDE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/server_constants";
import { registerFindTagsTool } from "@app/lib/actions/mcp_internal_actions/tools/tags/find_tags";
import {
  checkConflictingTags,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  getDataSourceNameFromView,
  getDisplayNameForDocument,
} from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { CoreAPIDocument, Result, TimeFrame } from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  Err,
  Ok,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("include_data");

  const commonInputsSchema = {
    timeFrame:
      ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
      ].optional(),
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

  async function includeFunction({
    timeFrame,
    dataSources,
    tagsIn,
    tagsNot,
  }: {
    timeFrame?: TimeFrame;
    dataSources: DataSourcesToolConfigurationType;
    tagsIn?: string[];
    tagsNot?: string[];
  }): Promise<
    Result<
      (
        | TextContent
        | {
            type: "resource";
            resource:
              | IncludeResultResourceType
              | IncludeQueryResourceType
              | WarningResourceType;
          }
      )[],
      MCPError
    >
  > {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const credentials = dustManagedCredentials();

    if (!agentLoopContext?.runContext) {
      throw new Error(
        "agentLoopRunContext is required where the tool is called."
      );
    }

    const { citationsOffset, retrievalTopK } =
      agentLoopContext.runContext.stepContext;

    // Get the core search args for each data source, fail if any of them are invalid.
    const coreSearchArgsResults = await concurrentExecutor(
      dataSources,
      async (dataSourceConfiguration) =>
        getCoreSearchArgs(auth, dataSourceConfiguration),
      { concurrency: 10 }
    );

    // If any of the data sources are invalid, return an error message.
    if (coreSearchArgsResults.some((res) => res.isErr())) {
      return new Err(
        new MCPError(
          removeNulls(
            coreSearchArgsResults.map((res) => (res.isErr() ? res.error : null))
          )
            .map((error) => error.message)
            .join("\n"),
          { tracked: false }
        )
      );
    }

    const coreSearchArgs = removeNulls(
      coreSearchArgsResults.map((res) => (res.isOk() ? res.value : null))
    );

    const conflictingTagsError = checkConflictingTags(coreSearchArgs, {
      tagsIn,
      tagsNot,
    });
    if (conflictingTagsError) {
      return new Err(new MCPError(conflictingTagsError, { tracked: false }));
    }

    const searchResults = await coreAPI.searchDataSources(
      "",
      retrievalTopK,
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
      return new Err(new MCPError(searchResults.error.message));
    }

    if (citationsOffset + retrievalTopK > getRefs().length) {
      return new Err(
        new MCPError(
          "The inclusion exhausted the total number of references available for citations"
        )
      );
    }

    const refs = getRefs().slice(
      citationsOffset,
      citationsOffset + retrievalTopK
    );

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
          chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
        };
      });

    const warningResource = makeWarningResource(
      searchResults.value.documents,
      retrievalTopK,
      timeFrame ?? null
    );

    return new Ok([
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
    ]);
  }

  if (!areTagsDynamic) {
    server.tool(
      INCLUDE_TOOL_NAME,
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
      commonInputsSchema,
      withToolLogging(
        auth,
        { toolNameForMonitoring: "include", agentLoopContext },
        includeFunction
      )
    );
  } else {
    server.tool(
      INCLUDE_TOOL_NAME,
      "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
      {
        ...commonInputsSchema,
        ...tagsInputSchema,
      },
      withToolLogging(
        auth,
        { toolNameForMonitoring: "include", agentLoopContext },
        includeFunction
      )
    );

    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
      extraDescription: `This tool is meant to be used before the ${INCLUDE_TOOL_NAME} tool.`,
    });
  }

  return server;
}

function makeQueryResource(
  timeFrame: TimeFrame | null
): IncludeQueryResourceType {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_QUERY,
    text: `Requested to include documents ${renderRelativeTimeFrameForToolOutput(timeFrame)}.`,
    uri: "",
  };
}

function makeWarningResource(
  documents: CoreAPIDocument[],
  topK: number,
  timeFrame: TimeFrame | null
): WarningResourceType | null {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);

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
