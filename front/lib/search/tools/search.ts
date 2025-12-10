import { Readable } from "stream";

import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  download as googleDriveDownload,
  search as googleDriveSearch,
} from "@app/lib/providers/google_drive/search";
import {
  download as microsoftDownload,
  search as microsoftSearch,
} from "@app/lib/providers/microsoft/search";
import { FileResource } from "@app/lib/resources/file_resource";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SearchableTool,
  ToolSearchRawResult,
  ToolSearchResult,
} from "@app/lib/search/tools/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { FileType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

const SEARCHABLE_TOOLS = {
  google_drive: { search: googleDriveSearch, download: googleDriveDownload },
  microsoft_drive: { search: microsoftSearch, download: microsoftDownload },
} as const satisfies Partial<Record<InternalMCPServerNameType, SearchableTool>>;
type SearchableMCPServerNameType = keyof typeof SEARCHABLE_TOOLS;

function _isSearchableTool(
  serverName: InternalMCPServerNameType
): serverName is SearchableMCPServerNameType {
  return serverName in SEARCHABLE_TOOLS;
}

async function _getToolAndAccessTokenForView(
  auth: Authenticator,
  serverView: MCPServerViewResource
): Promise<{ tool: SearchableTool; accessToken: string } | null> {
  const r = getInternalMCPServerNameAndWorkspaceId(serverView.mcpServerId);
  if (r.isErr() || !_isSearchableTool(r.value.name)) {
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
    tool: SEARCHABLE_TOOLS[r.value.name],
    accessToken: connectionResult.access_token,
  };
}

export async function searchToolFiles({
  auth,
  query,
  pageSize,
}: {
  auth: Authenticator;
  query: string;
  pageSize: number;
}): Promise<ToolSearchResult[]> {
  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const serverViews = await MCPServerViewResource.listBySpaces(auth, spaces);

  const searchableServerViews = serverViews.filter((view) => {
    const r = getInternalMCPServerNameAndWorkspaceId(view.mcpServerId);
    return r.isOk() && _isSearchableTool(r.value.name);
  });

  if (searchableServerViews.length === 0) {
    return [];
  }

  const results = await concurrentExecutor(
    searchableServerViews,
    async (serverView) => {
      const result = await _getToolAndAccessTokenForView(auth, serverView);
      if (!result) {
        return [];
      }

      let rawResults: ToolSearchRawResult[] = [];
      try {
        rawResults = await result.tool.search({
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
      return rawResults.map((rawResult) => ({
        ...rawResult,
        serverViewId: serverView.sId,
        serverName: serverJson.server.name,
        serverIcon: serverJson.server.icon,
      }));
    },
    { concurrency: 4 }
  );

  return results.flat();
}

export async function getToolAccessToken({
  auth,
  serverViewId,
}: {
  auth: Authenticator;
  serverViewId: string;
}): Promise<Result<{ tool: SearchableTool; accessToken: string }, Error>> {
  const serverView = await MCPServerViewResource.fetchById(auth, serverViewId);
  if (!serverView) {
    return new Err(new Error("MCP server view not found."));
  }

  const result = await _getToolAndAccessTokenForView(auth, serverView);
  if (!result) {
    return new Err(new Error("Failed to get tool access token."));
  }

  return new Ok(result);
}

export async function downloadAndUploadToolFile({
  auth,
  tool,
  accessToken,
  externalId,
  conversationId,
}: {
  auth: Authenticator;
  tool: SearchableTool;
  accessToken: string;
  externalId: string;
  conversationId?: string;
}): Promise<Result<FileType, Error>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  let downloadResult;
  try {
    downloadResult = await tool.download({
      accessToken,
      externalId,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: owner.sId,
        externalId,
      },
      "Error downloading tool file"
    );

    return new Err(
      new Error(
        `Failed to download file: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    );
  }

  const contentTypeToExtension: Record<string, string> = {
    "text/markdown": "md",
    "text/csv": "csv",
    "text/plain": "txt",
  };
  const extension = contentTypeToExtension[downloadResult.contentType] ?? "txt";

  const file = await FileResource.makeNew({
    contentType: downloadResult.contentType,
    fileName: `${downloadResult.fileName}.${extension}`,
    fileSize: Buffer.byteLength(downloadResult.content, "utf8"),
    userId: user.id,
    workspaceId: owner.id,
    useCase: "conversation",
    useCaseMetadata: conversationId ? { conversationId } : null,
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
