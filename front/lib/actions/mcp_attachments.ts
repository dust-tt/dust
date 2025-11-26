import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ContentNode } from "@app/types";

// Extends ContentNode with server view info inline rather than grouping results by server.
// This keeps each node self-contained: serverViewId is needed to fetch the file content
// (ensures we use the same connection as search), serverName/serverIcon are for display.
export type ToolContentNode = ContentNode & {
  serverViewId: string;
  serverName: string;
  serverIcon: CustomResourceIconType | InternalAllowedIconType;
};

export type SearchForAttachResponseBody = {
  nodes: ToolContentNode[];
  resultsCount: number;
};

export type GetFileToAttachResponse = {
  fileId: string;
  fileName: string;
  originalMimeType: string;
  exportedMimeType: string;
  contentBase64: string;
  contentSize: number;
};

async function _callMCPTool({
  auth,
  serverId,
  accessToken,
  toolName,
  toolArgs,
}: {
  auth: Authenticator;
  serverId: string;
  accessToken: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}): Promise<CallToolResult> {
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  try {
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();

    await connectToInternalMCPServer(serverId, serverTransport, auth);
    await mcpClient.connect(clientTransport);

    clientTransport.setAuthInfo({
      token: accessToken,
      clientId: "dust",
      scopes: [],
      extra: {},
    });

    const toolResult = await mcpClient.callTool(
      { name: toolName, arguments: toolArgs },
      CallToolResultSchema,
      { timeout: 30000 }
    );

    // Type cast needed due to MCP SDK using Zod passthrough in CallToolResultSchema.
    return toolResult as CallToolResult;
  } finally {
    await mcpClient.close();
  }
}

function _getTextContent(
  toolResult: CallToolResult
): { type: "text"; text: string } | undefined {
  const content = (toolResult.content as CallToolResult["content"]) ?? [];
  return content.find(
    (c): c is { type: "text"; text: string } => c.type === "text"
  );
}

export async function searchServerForAttachments({
  auth,
  serverId,
  query,
  pageSize,
  accessToken,
}: {
  auth: Authenticator;
  serverId: string;
  query: string;
  pageSize: number;
  accessToken: string;
}): Promise<ContentNode[]> {
  try {
    const toolResult = await _callMCPTool({
      auth,
      serverId,
      accessToken,
      toolName: "search_for_attach",
      toolArgs: { query, pageSize },
    });

    if (toolResult.isError) {
      logger.warn(
        {
          serverId,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Tool execution failed for search_for_attach"
      );
      return [];
    }

    const textContent = _getTextContent(toolResult);
    if (!textContent) {
      return [];
    }

    const result: { nodes: ContentNode[] } = JSON.parse(textContent.text);
    return result.nodes;
  } catch (error) {
    logger.error(
      {
        error,
        serverId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error searching server for attachments"
    );
    return [];
  }
}

export async function getFileToAttach({
  auth,
  serverId,
  fileId,
  accessToken,
}: {
  auth: Authenticator;
  serverId: string;
  fileId: string;
  accessToken: string;
}): Promise<GetFileToAttachResponse> {
  const toolResult = await _callMCPTool({
    auth,
    serverId,
    accessToken,
    toolName: "get_file_to_attach",
    toolArgs: { fileId },
  });

  const textContent = _getTextContent(toolResult);

  if (toolResult.isError) {
    throw new Error(
      `Failed to get file: ${textContent?.text ?? "Unknown error"}`
    );
  }

  if (!textContent) {
    throw new Error("No result returned from tool.");
  }

  return JSON.parse(textContent.text);
}
