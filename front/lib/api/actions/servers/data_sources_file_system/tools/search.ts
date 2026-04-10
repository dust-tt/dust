import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderSearchResults } from "@app/lib/actions/mcp_internal_actions/rendering";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  applyNodeIdsFilterToCoreSearchArgs,
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
  toCoreSearchArgs,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type {
  SearchWithNodesInputType,
  TagsInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { stripNullBytes } from "@app/types/shared/utils/string_utils";
import {
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types/shared/utils/time_frame";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

export async function search(
  {
    nodeIds,
    dataSources,
    query,
    relativeTimeFrame,
    tagsIn,
    tagsNot,
  }: SearchWithNodesInputType & TagsInputType,
  {
    auth,
    agentLoopContext,
  }: { auth: Authenticator; agentLoopContext?: AgentLoopContextType }
): Promise<Result<CallToolResult["content"], MCPError>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = await getLlmCredentials(auth);
  const timeFrame = parseTimeFrame(relativeTimeFrame ?? "all");

  if (!agentLoopContext?.runContext) {
    throw new Error(
      "agentLoopRunContext is required where the tool is called."
    );
  }

  const { retrievalTopK, citationsOffset } =
    agentLoopContext.runContext.stepContext;

  const agentDataSourceConfigurationsResult =
    await getAgentDataSourceConfigurations(auth, dataSources);

  if (agentDataSourceConfigurationsResult.isErr()) {
    return agentDataSourceConfigurationsResult;
  }
  const agentDataSourceConfigurations =
    agentDataSourceConfigurationsResult.value;

  const coreSearchArgs = applyNodeIdsFilterToCoreSearchArgs(
    toCoreSearchArgs(agentDataSourceConfigurations),
    nodeIds
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

  const conflictingTags = checkConflictingTags(
    coreSearchArgs.map(({ filter }) => filter.tags),
    { tagsIn, tagsNot }
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  const searchResults = await coreAPI.bulkSearchDataSources(
    query,
    retrievalTopK,
    credentials,
    false,
    coreSearchArgs.map((args) => {
      // In addition to the tags provided by the user, we add the tags the agent passed.
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
    return new Err(
      new MCPError(`Failed to search content: ${searchResults.error.message}`)
    );
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

  const results = searchResults.value.documents.map(
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
        text: `"${getDisplayNameForDocument(doc)}" (${doc.chunks.length} chunks)`,

        id: doc.document_id,
        source: {
          provider: dataSourceView.dataSource.connectorProvider ?? undefined,
          data_source_id: dataSourceView.dataSource.sId,
          data_source_view_id: dataSourceView.sId,
        },
        tags: doc.tags,
        ref: refs.shift() as string,
        chunks: doc.chunks.map((chunk) => stripNullBytes(chunk.text)),
      };
    }
  );

  const searchNodeIds = searchResults.value.documents.map(
    ({ document_id }) => document_id
  );

  let renderedNodes;
  if (searchNodeIds.length > 0) {
    const searchResult = await coreAPI.searchNodes({
      filter: {
        node_ids: searchNodeIds,
        data_source_views: makeCoreSearchNodesFilters({
          agentDataSourceConfigurations,
          additionalDynamicTags: { tagsIn, tagsNot },
        }),
      },
      options: {
        limit: searchNodeIds.length,
      },
    });

    if (searchResult.isErr()) {
      return new Err(
        new MCPError(`Failed to search content: ${searchResult.error.message}`)
      );
    }
    renderedNodes = renderSearchResults(
      searchResult.value,
      agentDataSourceConfigurations
    );
  }

  return new Ok([
    ...(renderedNodes
      ? [{ type: "resource" as const, resource: renderedNodes }]
      : []),
    ...results.map((result) => ({
      type: "resource" as const,
      resource: result,
    })),
  ]);
}
