import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  IncludeQueryResourceType,
  IncludeResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
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

const serverInfo: InternalMCPServerDefinitionType = {
  name: "include_data",
  version: "1.0.0",
  description: "Include data exhaustively (mcp)",
  icon: "ActionTimeIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopRunContext?: AgentLoopRunContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "retrieve_recent_documents",
    "Fetch the most recent documents in reverse chronological order up to a pre-allocated size. This tool retrieves content that is already pre-configured by the user, ensuring the latest information is included.",
    {
      timeFrame:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
        ],
      dataSources:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
        ],
    },
    async ({ timeFrame, dataSources }) => {
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const credentials = dustManagedCredentials();

      if (!agentLoopRunContext) {
        throw new Error(
          "agentLoopRunContext is required where the tool is called."
        );
      }

      // Compute the topK and refsOffset for the search.
      const topK = getRetrievalTopK({
        agentConfiguration: agentLoopRunContext.agentConfiguration,
        stepActions: agentLoopRunContext.stepActions,
      });
      const refsOffset = actionRefsOffset({
        agentConfiguration: agentLoopRunContext.agentConfiguration,
        stepActionIndex: agentLoopRunContext.stepActionIndex,
        stepActions: agentLoopRunContext.stepActions,
        refsOffset: agentLoopRunContext.citationsRefsOffset,
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
        coreSearchArgs.map((args) => ({
          projectId: args.projectId,
          dataSourceId: args.dataSourceId,
          filter: {
            ...args.filter,
            tags: {
              in: args.filter.tags?.in ?? null,
              not: args.filter.tags?.not ?? null,
            },
            timestamp: {
              gt: timeFrame ? timeFrameFromNow(timeFrame) : null,
              lt: null,
            },
          },
          view_filter: args.view_filter,
        }))
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
            mimeType:
              INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_RESULT,
            uri: doc.source_url ?? "",
            text: getDisplayNameForDocument(doc),

            id: doc.document_id,
            source: {
              provider:
                dataSourceView.dataSource.connectorProvider ?? undefined,
              name: getDataSourceNameFromView(dataSourceView),
            },
            tags: doc.tags,
            ref: refs.shift() as string,
            chunks: doc.chunks.map((chunk) => chunk.text),
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
            resource: makeQueryResource(
              searchResults.value.documents,
              topK,
              timeFrame ?? null
            ),
          },
        ],
      };
    }
  );

  return server;
}

function makeQueryResource(
  documents: CoreAPIDocument[],
  topK: number,
  timeFrame: TimeFrame | null
): IncludeQueryResourceType {
  const timeFrameAsString = timeFrame
    ? "over the last " +
      (timeFrame.duration > 1
        ? `${timeFrame.duration} ${timeFrame.unit}s`
        : `${timeFrame.unit}`)
    : "across all time periods";

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

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_INCLUDE_QUERY,
    text: `Including ${timeFrameAsString}.`,
    warning: tooManyChunks
      ? {
          title: `Limited retrieval (from now to ${retrievalDateLimitAsString}`,
          description: `Too much data to retrieve! Retrieved ${topK} excerpts from ${documents?.length} recent docs, up to ${retrievalDateLimitAsString}.`,
        }
      : undefined,
    uri: "",
  };
}

export default createServer;
