import { Readable } from "stream";

import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { processAndStoreFile } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  download as githubDownload,
  search as githubSearch,
} from "@app/lib/providers/github/search";
import {
  download as googleDriveDownload,
  search as googleDriveSearch,
} from "@app/lib/providers/google_drive/search";
import {
  download as jiraDownload,
  search as jiraSearch,
} from "@app/lib/providers/jira/search";
import {
  download as microsoftDownload,
  search as microsoftSearch,
} from "@app/lib/providers/microsoft/search";
import {
  download as notionDownload,
  search as notionSearch,
} from "@app/lib/providers/notion/search";
import {
  download as zendeskDownload,
  search as zendeskSearch,
} from "@app/lib/providers/zendesk/search";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SearchableTool,
  ToolSearchRawResult,
  ToolSearchResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import type { ConnectorProvider, FileType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

const SEARCHABLE_TOOLS = {
  github: { search: githubSearch, download: githubDownload },
  google_drive: { search: googleDriveSearch, download: googleDriveDownload },
  jira: { search: jiraSearch, download: jiraDownload },
  notion: { search: notionSearch, download: notionDownload },
  microsoft_drive: { search: microsoftSearch, download: microsoftDownload },
  zendesk: { search: zendeskSearch, download: zendeskDownload },
} as const satisfies Partial<Record<InternalMCPServerNameType, SearchableTool>>;
type SearchableMCPServerNameType = keyof typeof SEARCHABLE_TOOLS;

// Mapping from MCP tool name to connector provider
// When a connector exists for a provider, we exclude the corresponding tool to avoid duplication
const TOOL_TO_CONNECTOR_PROVIDER: Partial<
  Record<SearchableMCPServerNameType, ConnectorProvider>
> = {
  google_drive: "google_drive",
  notion: "notion",
  microsoft_drive: "microsoft",
};

function _isSearchableTool(
  serverName: InternalMCPServerNameType
): serverName is SearchableMCPServerNameType {
  return serverName in SEARCHABLE_TOOLS;
}

async function _getToolAndAccessTokenForView(
  auth: Authenticator,
  serverView: MCPServerViewResource
): Promise<{
  tool: SearchableTool;
  accessToken: string;
  metadata: Record<string, string>;
} | null> {
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
    metadata: connectionResult.connection.metadata,
  };
}

async function searchServerView(
  auth: Authenticator,
  serverView: MCPServerViewResource,
  query: string,
  pageSize: number
): Promise<ToolSearchResult[]> {
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
      metadata: result.metadata,
    });
  } catch (error) {
    const r = getInternalMCPServerNameAndWorkspaceId(serverView.mcpServerId);
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
}

export async function* streamToolFiles({
  auth,
  query,
  pageSize,
}: {
  auth: Authenticator;
  query: string;
  pageSize: number;
}): AsyncGenerator<ToolSearchResult[], void, undefined> {
  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const serverViews = await MCPServerViewResource.listBySpaces(auth, spaces);

  // Build the set of connectors that the user has access to
  const dataSourceViews = await DataSourceViewResource.listBySpaces(
    auth,
    spaces
  );
  const activeConnectorProviders = new Set(
    dataSourceViews.map((dsv) => dsv.dataSource.connectorProvider)
  );

  const searchableServerViews = serverViews.filter((view) => {
    const r = getInternalMCPServerNameAndWorkspaceId(view.mcpServerId);
    if (!r.isOk() || !_isSearchableTool(r.value.name)) {
      return false;
    }

    // Exclude the tool if a connector for the same provider is active
    const connectorProvider = TOOL_TO_CONNECTOR_PROVIDER[r.value.name];
    if (connectorProvider && activeConnectorProviders.has(connectorProvider)) {
      return false;
    }

    return true;
  });

  if (searchableServerViews.length === 0) {
    return;
  }

  // Create promises for all searches with unique IDs to track them
  interface PromiseWithId {
    promise: Promise<ToolSearchResult[]>;
    id: symbol;
  }

  const pending: PromiseWithId[] = searchableServerViews.map((serverView) => ({
    promise: searchServerView(auth, serverView, query, pageSize),
    id: Symbol(),
  }));

  // Yield results as each promise completes (not in order)
  while (pending.length > 0) {
    // Wrap each pending promise to include its ID when it resolves
    const wrappedPromises = pending.map(({ promise, id }) =>
      promise.then((results) => ({ results, id }))
    );

    // Wait for the first one to complete
    const completed = await Promise.race(wrappedPromises);

    // Remove the completed promise from pending
    const index = pending.findIndex((p) => p.id === completed.id);
    if (index !== -1) {
      pending.splice(index, 1);
    }

    // Yield results if not empty
    if (completed.results.length > 0) {
      yield completed.results;
    }
  }
}

export async function getToolAccessToken({
  auth,
  serverViewId,
}: {
  auth: Authenticator;
  serverViewId: string;
}): Promise<
  Result<
    {
      tool: SearchableTool;
      accessToken: string;
      metadata: Record<string, string>;
    },
    Error
  >
> {
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
  metadata,
  serverName,
  serverIcon,
}: {
  auth: Authenticator;
  tool: SearchableTool;
  accessToken: string;
  externalId: string;
  conversationId?: string;
  metadata?: Record<string, string>;
  serverName?: string;
  serverIcon?: string;
}): Promise<Result<FileType, Error>> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  let downloadResult;
  try {
    downloadResult = await tool.download({
      accessToken,
      externalId,
      metadata,
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
    useCaseMetadata: {
      ...(conversationId ? { conversationId } : {}),
      ...(serverName ? { sourceProvider: serverName } : {}),
      ...(serverIcon ? { sourceIcon: serverIcon } : {}),
    },
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
