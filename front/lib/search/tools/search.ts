import { Readable } from "stream";

import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  download as googleDriveDownload,
  search as googleDriveSearch,
} from "@app/lib/actions/mcp_internal_actions/servers/google_drive";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SearchableTool,
  ToolSearchNode,
  ToolSearchRawNode,
} from "@app/lib/search/tools/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FileType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

const SEARCHABLE_MCP_SERVERS = {
  google_drive: { search: googleDriveSearch, download: googleDriveDownload },
} as const satisfies Partial<Record<InternalMCPServerNameType, SearchableTool>>;
type SearchableMCPServerNameType = keyof typeof SEARCHABLE_MCP_SERVERS;

function _isSearchableMCPServer(
  serverName: InternalMCPServerNameType
): serverName is SearchableMCPServerNameType {
  return serverName in SEARCHABLE_MCP_SERVERS;
}

async function _getToolAccessToken(
  auth: Authenticator,
  serverView: MCPServerViewResource
): Promise<{ tool: SearchableTool; accessToken: string } | null> {
  const r = getInternalMCPServerNameAndWorkspaceId(serverView.mcpServerId);
  if (r.isErr() || !_isSearchableMCPServer(r.value.name)) {
    return null;
  }

  const connectionType: MCPServerConnectionConnectionType =
    serverView.oAuthUseCase === "platform_actions" ? "workspace" : "personal";

  const connectionResult = await getConnectionForMCPServer(auth, {
    mcpServerId: serverView.mcpServerId,
    connectionType,
  });

  if (!connectionResult) {
    return null;
  }

  return {
    tool: SEARCHABLE_MCP_SERVERS[r.value.name],
    accessToken: connectionResult.access_token,
  };
}

export async function searchToolNodes({
  auth,
  query,
  pageSize,
}: {
  auth: Authenticator;
  query: string;
  pageSize: number;
}): Promise<ToolSearchNode[]> {
  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const serverViews = await MCPServerViewResource.listBySpaces(auth, spaces);

  const searchableServerViews = serverViews.filter((view) => {
    const r = getInternalMCPServerNameAndWorkspaceId(view.mcpServerId);
    return r.isOk() && _isSearchableMCPServer(r.value.name);
  });

  if (searchableServerViews.length === 0) {
    return [];
  }

  const results = await concurrentExecutor(
    searchableServerViews,
    async (serverView) => {
      const result = await _getToolAccessToken(auth, serverView);
      if (!result) {
        return [];
      }

      let nodes: ToolSearchRawNode[] = [];
      try {
        nodes = await result.tool.search({
          accessToken: result.accessToken,
          query,
          pageSize,
        });
      } catch (error) {
        const r = getInternalMCPServerNameAndWorkspaceId(
          serverView.mcpServerId
        );
        logger.error(
          {
            error,
            serverName: r.isOk() ? r.value.name : "unknown",
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
          "Error searching for attachments"
        );
        return [];
      }

      const serverJson = serverView.toJSON();
      return nodes.map((node) => ({
        ...node,
        serverViewId: serverView.sId,
        serverName: serverJson.server.name,
        serverIcon: serverJson.server.icon,
      }));
    },
    { concurrency: 4 }
  );

  return results.flat();
}

export async function downloadAndUploadToolFile({
  auth,
  serverViewId,
  internalId,
}: {
  auth: Authenticator;
  serverViewId: string;
  internalId: string;
}): Promise<Result<FileType, Error>> {
  // Fetch the MCP server view and gets its acess token.
  const serverView = await MCPServerViewResource.fetchById(auth, serverViewId);
  if (!serverView) {
    return new Err(new Error("MCP server view not found."));
  }

  const mcpServerIdResult = getInternalMCPServerNameAndWorkspaceId(
    serverView.mcpServerId
  );
  if (mcpServerIdResult.isErr()) {
    return new Err(new Error("Invalid MCP server ID."));
  }
  const serverName = mcpServerIdResult.value.name;
  if (!_isSearchableMCPServer(serverName)) {
    return new Err(new Error("Server does not support file download."));
  }

  const connectionType: MCPServerConnectionConnectionType =
    serverView.oAuthUseCase === "platform_actions" ? "workspace" : "personal";

  const connectionResult = await getConnectionForMCPServer(auth, {
    mcpServerId: serverView.mcpServerId,
    connectionType,
  });
  if (!connectionResult) {
    return new Err(new Error("Failed to authenticate with the tool."));
  }

  // Download the file from the tool and upload it to our storage:
  // we use useCase "conversation" for tool-uploaded files.
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();
  const tool = SEARCHABLE_MCP_SERVERS[serverName];

  let downloadResult;
  try {
    downloadResult = await tool.download({
      accessToken: connectionResult.access_token,
      internalId,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: owner.sId,
        serverViewId,
        internalId,
      },
      "Error downloading tool file"
    );

    return new Err(
      new Error(
        `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }

  const file = await FileResource.makeNew({
    contentType: "text/plain",
    fileName: `${downloadResult.fileName}.txt`,
    fileSize: Buffer.byteLength(downloadResult.content, "utf8"),
    userId: user.id,
    workspaceId: owner.id,
    useCase: "conversation",
  });

  const processResult = await processAndStoreFile(auth, {
    file,
    content: {
      type: "readable",
      value: Readable.from(downloadResult.content),
    },
  });

  if (processResult.isErr()) {
    return new Err(
      new Error(`Failed to process file: ${processResult.error.message}`)
    );
  }

  return new Ok(file.toJSON(auth));
}
