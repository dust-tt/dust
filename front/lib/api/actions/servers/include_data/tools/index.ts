import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  IncludeResultResourceType,
  WarningResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  checkConflictingTags,
  shouldAutoGenerateTags,
} from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import { getCoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  makeIncludeResultResource,
  makeIncludeWarningResource,
} from "@app/lib/api/actions/servers/include_data/helpers";
import {
  INCLUDE_DATA_BASE_TOOLS_METADATA,
  INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/include_data/metadata";
import { executeFindTags } from "@app/lib/api/actions/tools/find_tags";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import { timeFrameFromNow } from "@app/types/shared/utils/time_frame";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

// Create tools with access to auth via closure
export function createIncludeDataTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) {
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
            resource: IncludeResultResourceType | WarningResourceType;
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
    const coreSearchArgsResults = await getCoreSearchArgs(auth, dataSources);

    // If any of the data sources are invalid, return an error message.
    if (coreSearchArgsResults.isErr()) {
      return new Err(
        new MCPError(coreSearchArgsResults.error.message, { tracked: false })
      );
    }

    const coreSearchArgs = coreSearchArgsResults.value;

    const conflictingTagsError = checkConflictingTags(
      coreSearchArgs.map(({ filter }) => filter.tags),
      { tagsIn, tagsNot }
    );
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

        return makeIncludeResultResource(doc, dataSourceView, refs);
      });

    const warningResource = makeIncludeWarningResource(
      searchResults.value.documents,
      retrievalTopK,
      timeFrame ?? null
    );

    return new Ok([
      ...results.map((result) => ({
        type: "resource" as const,
        resource: result,
      })),
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
    // Return base tools without tags
    const handlers: ToolHandlers<typeof INCLUDE_DATA_BASE_TOOLS_METADATA> = {
      retrieve_recent_documents: async (params, _extra) => {
        return includeFunction(params);
      },
    };
    return buildTools(INCLUDE_DATA_BASE_TOOLS_METADATA, handlers);
  }

  // Return tools with tags support
  const handlers: ToolHandlers<typeof INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA> = {
    retrieve_recent_documents: async (params, _extra) => {
      return includeFunction(params);
    },
    find_tags: async ({ query, dataSources }, _extra) => {
      return executeFindTags(auth, query, dataSources);
    },
  };
  return buildTools(INCLUDE_DATA_WITH_TAGS_TOOLS_METADATA, handlers);
}
