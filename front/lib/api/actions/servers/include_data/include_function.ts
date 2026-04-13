import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  IncludeResultResourceType,
  WarningResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  applyNodeIdsFilterToCoreSearchArgs,
  getCoreSearchArgs,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  makeIncludeResultResource,
  makeIncludeWarningResource,
} from "@app/lib/api/actions/servers/include_data/helpers";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import { timeFrameFromNow } from "@app/types/shared/utils/time_frame";
import type { TextContent } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

/**
 * Core retrieval used by include_data and by project_manager's retrieve_recent_documents.
 * Assigns citation refs from {@link getRefs} the same way as the include_data server.
 */
export async function runIncludeDataRetrieval(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType,
  {
    timeFrame,
    dataSources,
    nodeIds,
    tagsIn,
    tagsNot,
  }: {
    timeFrame?: TimeFrame;
    dataSources: DataSourcesToolConfigurationType;
    nodeIds?: string[];
    tagsIn?: string[];
    tagsNot?: string[];
  }
): Promise<
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
  const credentials = await getLlmCredentials(auth);

  if (!agentLoopContext.runContext) {
    return new Err(
      new MCPError("No conversation context available", { tracked: false })
    );
  }

  const { citationsOffset, retrievalTopK } =
    agentLoopContext.runContext.stepContext;

  const coreSearchArgsResults = await getCoreSearchArgs(auth, dataSources);

  if (coreSearchArgsResults.isErr()) {
    return new Err(
      new MCPError(coreSearchArgsResults.error.message, { tracked: false })
    );
  }

  const coreSearchArgs = applyNodeIdsFilterToCoreSearchArgs(
    coreSearchArgsResults.value,
    nodeIds
  );

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
