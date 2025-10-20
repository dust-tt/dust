import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  FIND_TAGS_TOOL_NAME,
  SEARCH_SERVER_NAME,
  SEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { registerFindTagsTool } from "@app/lib/actions/mcp_internal_actions/tools/tags/find_tags";
import {
  checkConflictingTags,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import {
  SearchInputSchema,
  TagsInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { ensureAuthorizedDataSourceViews } from "@app/lib/actions/mcp_internal_actions/utils/data_source_views";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  Err,
  Ok,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

export async function searchFunction({
  query,
  relativeTimeFrame,
  dataSources,
  tagsIn,
  tagsNot,
  auth,
  agentLoopContext,
}: {
  query: string;
  relativeTimeFrame: string;
  dataSources: DataSourcesToolConfigurationType;
  tagsIn?: string[];
  tagsNot?: string[];
  auth: Authenticator;
  agentLoopContext?: AgentLoopContextType;
}): Promise<Result<CallToolResult["content"], MCPError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const credentials = dustManagedCredentials();
  const timeFrame = parseTimeFrame(relativeTimeFrame);

  if (!agentLoopContext?.runContext) {
    throw new Error(
      "agentLoopRunContext is required where the tool is called."
    );
  }

  const { retrievalTopK, citationsOffset } =
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
        "Invalid data sources: " +
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

  const authRes = await ensureAuthorizedDataSourceViews(
    auth,
    coreSearchArgs.map((a) => a.dataSourceView.sId)
  );
  if (authRes.isErr()) {
    return authRes;
  }

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

  const conflictingTagsError = checkConflictingTags(coreSearchArgs, {
    tagsIn,
    tagsNot,
  });
  if (conflictingTagsError) {
    return new Err(new MCPError(conflictingTagsError, { tracked: false }));
  }

  // Now we can search each data source.
  const searchResults = await coreAPI.searchDataSources(
    query,
    retrievalTopK,
    credentials,
    false,
    coreSearchArgs.map((args) => {
      // In addition to the tags provided by the user, we also add the tags that the model inferred
      // from the conversation history.
      const finalTagsIn = [...(args.filter.tags?.in ?? []), ...(tagsIn ?? [])];
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
        "The search exhausted the total number of references available for citations"
      )
    );
  }

  const refs = getRefs().slice(
    citationsOffset,
    citationsOffset + retrievalTopK
  );

  const results: SearchResultResourceType[] = searchResults.value.documents.map(
    (doc): SearchResultResourceType => {
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
        },
        tags: doc.tags,
        ref: refs.shift() as string,
        chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
      };
    }
  );

  return new Ok(
    results.map((result) => ({
      type: "resource" as const,
      resource: result,
    }))
  );
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SEARCH_SERVER_NAME);

  const areTagsDynamic = agentLoopContext
    ? shouldAutoGenerateTags(agentLoopContext)
    : false;

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      SearchInputSchema.shape,
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (args) => searchFunction({ ...args, auth, agentLoopContext })
      )
    );
  } else {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      {
        ...SearchInputSchema.shape,
        ...TagsInputSchema.shape,
      },
      withToolLogging(
        auth,
        {
          toolNameForMonitoring: SEARCH_TOOL_NAME,
          agentLoopContext,
          enableAlerting: true,
        },
        async (args) => searchFunction({ ...args, auth, agentLoopContext })
      )
    );

    registerFindTagsTool(auth, server, agentLoopContext, {
      name: FIND_TAGS_TOOL_NAME,
      extraDescription: `This tool is meant to be used before the ${SEARCH_TOOL_NAME} tool.`,
    });
  }

  return server;
}

export default createServer;
