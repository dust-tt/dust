import { getDataSourceURI } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { isSearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { searchFunction } from "@app/lib/api/actions/servers/search/tools";
import { getDataSourcesAndWorkspaceIdForGlobalAgents } from "@app/lib/api/assistant/global_agents/tools";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { isIncludedInDefaultCompanyData } from "@app/lib/data_sources";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const inputSchema = {
  query: z
    .string()
    .describe(
      "Semantic search query. Include relevant context and keywords for best results."
    ),
  relativeTimeFrame: z
    .string()
    .regex(/^(all|\d+[hdwmy])$/)
    .optional()
    .describe(
      "Optional time frame to restrict results relative to now. Values: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y` (e.g. `7d`, `30d`). Defaults to `all`."
    ),
  tagsIn: z
    .array(z.string())
    .optional()
    .describe(
      "Optional labels (tags) to include. Documents matching at least one tag are returned."
    ),
  tagsNot: z
    .array(z.string())
    .optional()
    .describe("Optional labels (tags) to exclude from results."),
  nodeIds: z
    .array(z.string())
    .optional()
    .describe(
      "Optional content node IDs to scope the search to specific folders or documents."
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(64)
    .default(10)
    .describe(
      "Maximum number of document chunks to return (default 10, max 64)."
    ),
};

export function registerSearchTool(server: McpServer) {
  server.registerTool(
    "search",
    {
      description:
        "Semantic search across all globally accessible spaces in Dust. Returns matching document chunks ranked by relevance.",
      inputSchema,
    },
    async ({ query, relativeTimeFrame, tagsIn, tagsNot, nodeIds, topK }) => {
      const auth = getAuthenticatorFromMcpContext();

      const { dataSourceViews, workspaceId } =
        await getDataSourcesAndWorkspaceIdForGlobalAgents(auth);

      const dataSources = dataSourceViews
        .filter((dsView) => isIncludedInDefaultCompanyData(dsView.dataSource))
        .map((dsView) => ({
          uri: getDataSourceURI({
            dataSourceViewId: dsView.sId,
            workspaceId,
            filter: {
              parents: {
                in: dsView.parentsIn ?? [],
                not: [],
              },
              tags: null,
            },
          }),
          mimeType: "application/vnd.dust.tool-input.data-source" as const,
        }));

      if (dataSources.length === 0) {
        return mcpError(
          "No searchable data sources are available in globally accessible spaces."
        );
      }

      const searchResult = await searchFunction(auth, {
        query,
        relativeTimeFrame: relativeTimeFrame ?? "all",
        dataSources,
        nodeIds,
        tagsIn,
        tagsNot,
        stepContext: {
          citationsCount: topK,
          citationsOffset: 0,
          retrievalTopK: topK,
          resumeState: null,
          websearchResultCount: 0,
        },
      });

      if (searchResult.isErr()) {
        return mcpError(searchResult.error.message);
      }

      const results = searchResult.value
        .filter(isSearchResultResourceType)
        .map(({ resource }) => ({
          ref: resource.ref,
          title: resource.text,
          uri: resource.uri,
          id: resource.id,
          provider: resource.source.provider ?? null,
          dataSourceId: resource.source.data_source_id ?? null,
          dataSourceViewId: resource.source.data_source_view_id ?? null,
          tags: resource.tags,
          chunks: resource.chunks,
        }));

      return mcpJsonResponse({
        count: results.length,
        results,
      });
    }
  );
}
