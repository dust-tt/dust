import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  getCoreSearchArgs,
  renderRelativeTimeFrameForToolOutput,
  renderTagsForToolOutput,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
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

  const results: SearchResultResourceType[] = searchResults.value.documents.map(
    (doc) => {
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
        resource: makeQueryResource(query, timeFrame, tagsIn, tagsNot),
      },
    ],
  };
}

export function makeQueryResource(
  query: string,
  relativeTimeFrame: TimeFrame | null,
  tagsIn?: string[],
  tagsNot?: string[]
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);

  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text: query
      ? `Searching "${query}", ${timeFrameAsString}${tagsAsString}.`
      : `Searching ${timeFrameAsString}${tagsAsString}.`,
    uri: "",
  };
}
