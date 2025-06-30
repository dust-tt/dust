import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  renderRelativeTimeFrameForToolOutput,
  renderTagsForToolOutput,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import {
  checkConflictingTags,
  fetchAgentDataSourceConfiguration,
  getCoreSearchArgs,
  parseDataSourceConfigurationURI,
} from "@app/lib/actions/mcp_internal_actions/servers/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset, getRetrievalTopK } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { TimeFrame } from "@app/types";
import type { ConnectorProvider, Result } from "@app/types";
import {
  assertNever,
  CoreAPI,
  dustManagedCredentials,
  Err,
  Ok,
  parseTimeFrame,
  removeNulls,
  stripNullBytes,
  timeFrameFromNow,
} from "@app/types";

export type ResolvedDataSourceConfiguration = DataSourceConfiguration & {
  dataSource: {
    dustAPIProjectId: string;
    dustAPIDataSourceId: string;
    connectorProvider: ConnectorProvider | null;
    name: string;
  };
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

export async function getAgentDataSourceConfigurations(
  auth: Authenticator,
  dataSources: DataSourcesToolConfigurationType
): Promise<Result<ResolvedDataSourceConfiguration[], Error>> {
  const configResults = await concurrentExecutor(
    dataSources,
    async (dataSourceConfiguration) => {
      const configInfoRes = parseDataSourceConfigurationURI(
        dataSourceConfiguration.uri
      );

      if (configInfoRes.isErr()) {
        return configInfoRes;
      }

      const configInfo = configInfoRes.value;

      switch (configInfo.type) {
        case "database": {
          // Database configuration
          const r = await fetchAgentDataSourceConfiguration(configInfo.sId);
          if (r.isErr()) {
            return r;
          }
          const agentConfig = r.value;
          const dataSourceViewSId = DataSourceViewResource.modelIdToSId({
            id: agentConfig.dataSourceView.id,
            workspaceId: agentConfig.dataSourceView.workspaceId,
          });
          const resolved: ResolvedDataSourceConfiguration = {
            workspaceId: agentConfig.dataSourceView.workspace.sId,
            dataSourceViewId: dataSourceViewSId,
            filter: {
              parents:
                agentConfig.parentsIn || agentConfig.parentsNotIn
                  ? {
                      in: agentConfig.parentsIn || [],
                      not: agentConfig.parentsNotIn || [],
                    }
                  : null,
              tags:
                agentConfig.tagsIn || agentConfig.tagsNotIn
                  ? {
                      in: agentConfig.tagsIn || [],
                      not: agentConfig.tagsNotIn || [],
                      mode: agentConfig.tagsMode || "custom",
                    }
                  : undefined,
            },
            dataSource: {
              dustAPIProjectId: agentConfig.dataSource.dustAPIProjectId,
              dustAPIDataSourceId: agentConfig.dataSource.dustAPIDataSourceId,
              connectorProvider: agentConfig.dataSource.connectorProvider,
              name: agentConfig.dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        case "dynamic": {
          // Dynamic configuration
          // Verify the workspace ID matches the auth
          if (
            configInfo.configuration.workspaceId !==
            auth.getNonNullableWorkspace().sId
          ) {
            return new Err(
              new Error(
                "Workspace mismatch: configuration workspace " +
                  `${configInfo.configuration.workspaceId} does not match authenticated workspace.`
              )
            );
          }

          // Fetch the specific data source view by ID
          const dataSourceView = await DataSourceViewResource.fetchById(
            auth,
            configInfo.configuration.dataSourceViewId
          );

          if (!dataSourceView) {
            return new Err(
              new Error(
                `Data source view not found: ${configInfo.configuration.dataSourceViewId}`
              )
            );
          }

          const dataSource = dataSourceView.dataSource;

          const resolved: ResolvedDataSourceConfiguration = {
            ...configInfo.configuration,
            dataSource: {
              dustAPIProjectId: dataSource.dustAPIProjectId,
              dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
              connectorProvider: dataSource.connectorProvider,
              name: dataSource.name,
            },
          };
          return new Ok(resolved);
        }

        default:
          assertNever(configInfo);
      }
    },
    { concurrency: 10 }
  );

  if (configResults.some((res) => res.isErr())) {
    return new Err(new Error("Failed to fetch data source configurations."));
  }

  return new Ok(
    removeNulls(configResults.map((res) => (res.isOk() ? res.value : null)))
  );
}

export function makeDataSourceViewFilter(
  agentDataSourceConfigurations: ResolvedDataSourceConfiguration[]
) {
  return agentDataSourceConfigurations.map(({ dataSource, filter }) => ({
    data_source_id: dataSource.dustAPIDataSourceId,
    view_filter: filter.parents?.in ?? [],
  }));
}
