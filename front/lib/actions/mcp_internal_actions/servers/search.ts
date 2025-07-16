import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import { z } from "zod";

import { SEARCH_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeQueryResource } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  findTagsSchema,
  makeFindTagsDescription,
  makeFindTagsTool,
} from "@app/lib/actions/mcp_internal_actions/servers/common/find_tags_tool";
import {
  checkConflictingTags,
  getCoreSearchArgs,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { shouldAutoGenerateTags } from "@app/lib/actions/mcp_internal_actions/servers/utils";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import {
  CoreAPI,
  dustManagedCredentials,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "search",
  version: "1.0.0",
  description: "Search through selected Data sources",
  icon: "ActionMagnifyingGlassIcon",
  authorization: null,
  documentationUrl: null,
};

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
}): Promise<CallToolResult> {
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
    return makeMCPToolTextError(
      "Search action must have at least one data source configured."
    );
  }

  const conflictingTagsError = checkConflictingTags(coreSearchArgs, {
    tagsIn,
    tagsNot,
  });
  if (conflictingTagsError) {
    return {
      isError: false,
      content: [{ type: "text", text: conflictingTagsError }],
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
    return makeMCPToolTextError(searchResults.error.message);
  }

  if (refsOffset + topK > getRefs().length) {
    return makeMCPToolTextError(
      "The search exhausted the total number of references available for citations"
    );
  }

  const refs = getRefs().slice(refsOffset, refsOffset + topK);

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

  return {
    isError: false,
    content: [
      ...results.map((result) => ({
        type: "resource" as const,
        resource: result,
      })),
      {
        type: "resource" as const,
        resource: makeQueryResource({
          query,
          timeFrame,
          tagsIn,
          tagsNot,
        }),
      },
    ],
  };
}

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

  if (!areTagsDynamic) {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      commonInputsSchema,
      withToolLogging(auth, SEARCH_TOOL_NAME, async (args) =>
        searchFunction({ ...args, auth, agentLoopContext })
      )
    );
  } else {
    server.tool(
      SEARCH_TOOL_NAME,
      "Search the data sources specified by the user." +
        " The search is based on semantic similarity between the query and chunks of information" +
        " from the data sources.",
      {
        ...commonInputsSchema,
        ...tagsInputSchema,
      },
      withToolLogging(auth, SEARCH_TOOL_NAME, async (args) =>
        searchFunction({ ...args, auth, agentLoopContext })
      )
    );

    server.tool(
      "find_tags",
      makeFindTagsDescription(SEARCH_TOOL_NAME),
      findTagsSchema,
      makeFindTagsTool(auth)
    );
  }

  return server;
}

export default createServer;
