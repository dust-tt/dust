import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export function makeInternalMCPServer(
  serverName: InternalMCPServerNameType,
  options?: {
    augmentedInstructions?: string;
  }
): McpServer {
  const { serverInfo } = INTERNAL_MCP_SERVERS[serverName];
  const instructions =
    options?.augmentedInstructions ?? serverInfo.instructions ?? undefined;

  return new McpServer(serverInfo, {
    instructions,
  });
}

export function makeMCPToolTextError(text: string): {
  isError: true;
  content: [TextContent];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message?: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
};

/**
 * Helper function to get all available data sources for a user and convert them to the proper URI format
 */
async function getAllAvailableDataSources(auth: Authenticator) {
  try {
    const workspace = auth.getNonNullableWorkspace();
    const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);

    return dataSourceViews.map((dsv) => ({
      uri: `data_source_configuration://dust/w/${workspace.sId}/data_source_views/${dsv.sId}/filter/${encodeURIComponent(JSON.stringify({ parents: null, tags: null }))}`,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    }));
  } catch (error) {
    // Return empty array if there's an error fetching data sources
    return [];
  }
}

/**
 * Creates a data source schema with default values populated from all available data sources for the user
 */
export async function getDataSourceSchemaWithDefaults(auth: Authenticator) {
  const defaultDataSources = await getAllAvailableDataSources(auth);

  return ConfigurableToolInputSchemas[
    INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
  ].default(defaultDataSources);
}
