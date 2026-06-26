import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DataSourcesToolConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { renderNode } from "@app/lib/actions/mcp_internal_actions/rendering";
import { checkConflictingTags } from "@app/lib/actions/mcp_internal_actions/tools/tags/utils";
import {
  getAgentDataSourceConfigurations,
  makeCoreSearchNodesFilters,
} from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

// Above this size we nudge the model to use `grep` rather than reading the whole
// document linearly page by page, which can quickly exhaust the context window.
const LARGE_DOCUMENT_CHARS = 50_000;

// Builds a footer appended to the returned text so the model knows the total
// document size and whether more content remains, instead of blindly looping on
// `offset`. `grep` is applied by Core after offset/limit slicing, so the window
// is computed from offset/limit/total rather than from the (possibly filtered)
// returned text length.
function makeCatFooter({
  totalCharacters,
  offset,
  limit,
}: {
  totalCharacters: number;
  offset: number | null;
  limit: number | null;
}): string {
  const effectiveOffset = offset ?? 0;
  const sliceEnd =
    limit !== null
      ? Math.min(effectiveOffset + limit, totalCharacters)
      : totalCharacters;
  const charsRemaining = Math.max(0, totalCharacters - sliceEnd);

  if (charsRemaining > 0) {
    const grepHint =
      totalCharacters >= LARGE_DOCUMENT_CHARS
        ? " This document is large. Prefer `grep` to extract specific content instead of reading it all page by page."
        : "";
    return (
      `\n\n[Showing characters ${effectiveOffset}-${sliceEnd} of ${totalCharacters}.` +
      `${grepHint} Use offset=${sliceEnd} to continue reading.]`
    );
  }

  // Whole document returned in a single unbounded call: no footer needed.
  if (effectiveOffset === 0 && limit === null) {
    return "";
  }

  return `\n\n[End of document reached (${totalCharacters} characters total).]`;
}

export async function cat(
  {
    dataSources,
    nodeId,
    offset,
    limit,
    grep,
  }: {
    dataSources: DataSourcesToolConfigurationType;
    nodeId: string;
    offset?: number;
    limit?: number;
    grep?: string;
  },
  {
    auth,
    agentLoopContext,
  }: { auth: Authenticator; agentLoopContext?: AgentLoopContextType }
) {
  if (!agentLoopContext?.runContext) {
    return new Err(new MCPError("No conversation context available"));
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  // Gather data source configurations.
  const fetchResult = await getAgentDataSourceConfigurations(auth, dataSources);

  if (fetchResult.isErr()) {
    return fetchResult;
  }
  const agentDataSourceConfigurations = fetchResult.value;

  const conflictingTags = checkConflictingTags(
    agentDataSourceConfigurations.map(({ filter }) => filter.tags),
    {}
  );
  if (conflictingTags) {
    return new Err(new MCPError(conflictingTags, { tracked: false }));
  }

  // Search the node using our search api.
  const searchResult = await coreAPI.searchNodes({
    filter: {
      node_ids: [nodeId],
      data_source_views: makeCoreSearchNodesFilters({
        agentDataSourceConfigurations,
      }),
    },
  });

  if (searchResult.isErr() || searchResult.value.nodes.length === 0) {
    return new Err(
      new MCPError(
        `Could not find node: ${nodeId} (error: ${
          searchResult.isErr() ? searchResult.error.message : "No nodes found"
        })`,
        { tracked: false }
      )
    );
  }

  const node = searchResult.value.nodes[0];

  if (node.node_type !== "document") {
    return new Err(
      new MCPError(`Node is of type ${node.node_type}, not a document.`, {
        tracked: false,
      })
    );
  }

  // Get dataSource from the data source configuration.
  const dataSource = agentDataSourceConfigurations.find(
    (config) => config.dataSource.dustAPIDataSourceId === node.data_source_id
  )?.dataSource;

  if (!dataSource) {
    return new Err(
      new MCPError(`Could not find dataSource for node: ${nodeId}`)
    );
  }

  const dataSourceIdToConnectorMap = new Map();
  dataSourceIdToConnectorMap.set(
    dataSource.dustAPIDataSourceId,
    dataSource.connectorProvider
  );

  // Read the node.
  const readResult = await coreAPI.getDataSourceDocumentText({
    dataSourceId: node.data_source_id,
    documentId: node.node_id,
    projectId: dataSource.dustAPIProjectId,
    offset: offset,
    limit: limit,
    grep: grep,
  });

  if (readResult.isErr()) {
    return new Err(
      new MCPError(
        `Could not read node: ${nodeId} (error: ${readResult.error.message})`,
        {
          tracked: readResult.error.code !== "invalid_regex",
        }
      )
    );
  }

  const { citationsOffset } = agentLoopContext.runContext.stepContext;

  if (citationsOffset >= getRefs().length) {
    return new Err(
      new MCPError("Unable to provide a citation for this document")
    );
  }

  const ref = getRefs()[citationsOffset];

  const footer = makeCatFooter({
    totalCharacters: readResult.value.total_characters,
    offset: readResult.value.offset,
    limit: readResult.value.limit,
  });

  return new Ok([
    {
      type: "resource" as const,
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_NODE_CONTENT,
        uri: node.source_url ?? "",
        text: readResult.value.text + footer,
        metadata: renderNode(node, dataSourceIdToConnectorMap),
        ref: ref,
      },
    },
  ]);
}
