import { isCustomResourceIconType } from "@app/components/resources/resources_icons";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/constants";
import { requiresBearerTokenConfiguration } from "@app/lib/actions/mcp_helper";
import {
  allowsMultipleInstancesOfInternalMCPServerByName,
  getInternalMCPServerInfo,
  isInternalMCPServerName,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { getMCPConnectionAccessToken } from "@app/lib/actions/mcp_oauth_access_token";
import type {
  MCPServerType,
  MCPServerTypeWithViews,
  MCPServerViewType,
} from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { getOverridablePersonalAuthInputs } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { headersArrayToRecord } from "@app/types/shared/utils/http_headers";

const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 2048;

type CustomHeader = { key: string; value: string };

export async function listMCPServersWithViews(
  auth: Authenticator
): Promise<MCPServerTypeWithViews[]> {
  const [remoteMCPs, internalMCPs] = await Promise.all([
    RemoteMCPServerResource.listByWorkspace(auth),
    InternalMCPServerInMemoryResource.listByWorkspace(auth),
  ]);

  const servers = [...remoteMCPs, ...internalMCPs]
    .map((r) => r.toJSON())
    .sort((a, b) => a.name.localeCompare(b.name));

  // Batch-fetch all views in a single query instead of N+1.
  const allViews = await MCPServerViewResource.listByMCPServers(
    auth,
    servers.map((s) => s.sId)
  );

  const viewsByServerId = new Map<string, MCPServerViewType[]>();
  for (const view of allViews) {
    const existing = viewsByServerId.get(view.mcpServerId) ?? [];
    existing.push(view.toJSON());
    viewsByServerId.set(view.mcpServerId, existing);
  }

  return servers.map((server) => ({
    ...server,
    views: viewsByServerId.get(server.sId) ?? [],
  }));
}

export interface CreateRemoteMCPServerInput {
  url: string;
  defaultServerId?: number;
  includeGlobal?: boolean;
  sharedSecret?: string;
  useCase?: MCPOAuthUseCase;
  connectionId?: string;
  customHeaders?: CustomHeader[];
}

export async function createRemoteMCPServer(
  auth: Authenticator,
  input: CreateRemoteMCPServerInput
): Promise<Result<MCPServerType, Error>> {
  const { url, sharedSecret, customHeaders, connectionId, includeGlobal } =
    input;

  if (!url) {
    return new Err(new Error("URL is required"));
  }
  if (url.length > MAX_URL_LENGTH) {
    return new Err(
      new Error(
        `MCP server URL exceeds maximum length (${MAX_URL_LENGTH} characters).`
      )
    );
  }

  // Default to the shared secret if it exists.
  let bearerToken = sharedSecret ?? null;
  let authorization: AuthorizationInfo | null = null;

  // If a connectionId is provided, we use it to fetch the access token that must
  // have been created by the admin.
  if (connectionId) {
    const token = await getMCPConnectionAccessToken(auth, {
      connectionId,
    });
    if (token.isErr()) {
      return new Err(new Error("Error fetching OAuth connection access token"));
    }
    bearerToken = token.value.access_token;
    authorization = {
      provider: token.value.connection.provider,
      supported_use_cases: ["platform_actions", "personal_actions"],
    };
  }

  // Merge custom headers (if any) with Authorization when probing the server.
  // Authorization from OAuth/sharedSecret takes precedence over custom headers.
  const sanitizedCustomHeaders = headersArrayToRecord(customHeaders);
  const headers = bearerToken
    ? {
        ...(sanitizedCustomHeaders ?? {}),
        Authorization: `Bearer ${bearerToken}`,
      }
    : sanitizedCustomHeaders;

  const metadataRes = await fetchRemoteServerMetaDataByURL(auth, url, headers);
  if (metadataRes.isErr()) {
    return metadataRes;
  }
  const metadata = metadataRes.value;

  const defaultConfig =
    DEFAULT_REMOTE_MCP_SERVERS.find((config) => config.url === url) ??
    (input.defaultServerId !== undefined
      ? DEFAULT_REMOTE_MCP_SERVERS.find(
          (config) => config.id === input.defaultServerId
        )
      : undefined);

  const name = defaultConfig?.name ?? metadata.name;
  if (name.length > MAX_NAME_LENGTH) {
    return new Err(
      new Error(
        `MCP server name exceeds maximum length (${MAX_NAME_LENGTH} characters).`
      )
    );
  }

  if (includeGlobal) {
    const conflict = await checkNameConflictInGlobalSpace(auth, name);
    if (conflict.isErr()) {
      return conflict;
    }
  }

  const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(auth, {
    workspaceId: auth.getNonNullableWorkspace().id,
    url,
    cachedName: name,
    cachedDescription: defaultConfig?.description ?? metadata.description,
    cachedTools: metadata.tools,
    icon:
      defaultConfig?.icon ??
      (isCustomResourceIconType(metadata.icon)
        ? metadata.icon
        : DEFAULT_MCP_SERVER_ICON),
    version: metadata.version,
    sharedSecret: sharedSecret ?? null,
    // Persist only user-provided custom headers
    customHeaders: headersArrayToRecord(customHeaders),
    authorization,
    oAuthUseCase: input.useCase ?? null,
  });

  if (connectionId) {
    // We create a connection to the remote MCP server to allow the user to use
    // the MCP server in the future. The connection is of type "workspace"
    // because it is created by the admin. If the server can use personal
    // connections, we rely on this "workspace" connection to get the related
    // credentials.
    await MCPServerConnectionResource.makeNew(auth, {
      connectionId,
      connectionType: "workspace",
      serverType: "remote",
      remoteMCPServerId: newRemoteMCPServer.id,
    });
  }

  if (defaultConfig?.toolStakes) {
    for (const [toolName, stakeLevel] of Object.entries(
      defaultConfig.toolStakes
    )) {
      await RemoteMCPServerToolMetadataResource.makeNew(auth, {
        remoteMCPServerId: newRemoteMCPServer.id,
        toolName,
        permission: stakeLevel,
        enabled: true,
      });
    }
  }

  if (includeGlobal) {
    const viewRes = await createGlobalSpaceView(
      auth,
      newRemoteMCPServer.sId,
      "remote"
    );
    if (viewRes.isErr()) {
      return viewRes;
    }
  }

  return new Ok(newRemoteMCPServer.toJSON());
}

export interface CreateInternalMCPServerInput {
  name: string;
  useCase?: MCPOAuthUseCase;
  connectionId?: string;
  includeGlobal?: boolean;
  sharedSecret?: string;
  customHeaders?: CustomHeader[];
  viewName?: string;
  oauthScope?: string;
}

export async function createInternalMCPServer(
  auth: Authenticator,
  input: CreateInternalMCPServerInput
): Promise<Result<MCPServerType, Error>> {
  const { name, viewName, connectionId, includeGlobal } = input;

  if (!isInternalMCPServerName(name)) {
    return new Err(new Error("Invalid internal MCP server name"));
  }

  if (viewName !== undefined) {
    const trimmed = viewName.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      return new Err(new Error("viewName must be a non-empty string."));
    }
  }

  if (!allowsMultipleInstancesOfInternalMCPServerByName(name)) {
    const installedMCPServers = await MCPServerViewResource.listForSystemSpace(
      auth,
      { where: { serverType: "internal" } }
    );
    const alreadyUsed = installedMCPServers.some((mcpServer) =>
      matchesInternalMCPServerName(mcpServer.internalMCPServerId, name)
    );
    if (alreadyUsed) {
      return new Err(
        new Error(
          "This internal tool has already been added and only one instance is allowed."
        )
      );
    }
  }

  // Use viewName for the conflict check when provided (multi-instance),
  // otherwise fall back to the internal server name.
  const nameForConflictCheck = viewName ?? name;
  if (includeGlobal) {
    const conflict = await checkNameConflictInGlobalSpace(
      auth,
      nameForConflictCheck
    );
    if (conflict.isErr()) {
      return conflict;
    }
  }

  const newInternalMCPServer = await InternalMCPServerInMemoryResource.makeNew(
    auth,
    {
      name,
      useCase: input.useCase ?? null,
      viewName,
      oauthScope: input.oauthScope ?? null,
    }
  );

  if (connectionId) {
    // For personal tools, automatically create a personal connection for the
    // admin so they don't need to re-authenticate when they first use the tool.
    // Exception: If the provider has overridable credentials at personal auth
    // time, each user should authenticate separately with their own settings.
    const serverInfo = getInternalMCPServerInfo(name);
    const provider = serverInfo.authorization?.provider;
    const hasOverridableInputs = provider
      ? !!getOverridablePersonalAuthInputs({ provider })
      : false;
    if (input.useCase === "personal_actions" && !hasOverridableInputs) {
      await MCPServerConnectionResource.makeNew(auth, {
        connectionId,
        connectionType: "personal",
        serverType: "internal",
        internalMCPServerId: newInternalMCPServer.id,
      });
    }

    // Workspace connection used to get the related credentials for personal
    // connections.
    await MCPServerConnectionResource.makeNew(auth, {
      connectionId,
      connectionType: "workspace",
      serverType: "internal",
      internalMCPServerId: newInternalMCPServer.id,
    });
  }

  if (
    requiresBearerTokenConfiguration(newInternalMCPServer.toJSON()) &&
    (input.sharedSecret !== undefined || input.customHeaders !== undefined)
  ) {
    const sanitizedRecord = headersArrayToRecord(input.customHeaders);
    const customHeaders =
      Object.keys(sanitizedRecord).length > 0 ? sanitizedRecord : null;

    const upsertResult = await newInternalMCPServer.upsertCredentials(auth, {
      sharedSecret: input.sharedSecret,
      customHeaders,
    });
    if (upsertResult.isErr()) {
      throw upsertResult.error;
    }
  }

  if (includeGlobal) {
    const viewRes = await createGlobalSpaceView(
      auth,
      newInternalMCPServer.id,
      "internal"
    );
    if (viewRes.isErr()) {
      return viewRes;
    }
  }

  return new Ok(newInternalMCPServer.toJSON());
}

async function checkNameConflictInGlobalSpace(
  auth: Authenticator,
  name: string
): Promise<Result<void, Error>> {
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const { hasConflict } =
    await MCPServerViewResource.hasNameConflictInSpaceByName(
      auth,
      name,
      globalSpace
    );
  if (hasConflict) {
    return new Err(
      new Error(`An existing Tool is already using the name "${name}"`)
    );
  }
  return new Ok(undefined);
}

async function createGlobalSpaceView(
  auth: Authenticator,
  serverId: string,
  serverType: "remote" | "internal"
): Promise<Result<void, Error>> {
  const systemView = await MCPServerViewResource.getMCPServerViewForSystemSpace(
    auth,
    serverId
  );
  if (!systemView) {
    return new Err(
      new Error(
        `Missing system view for ${serverType} MCP server, it should have been created when creating the ${serverType} server.`
      )
    );
  }
  await MCPServerViewResource.create(auth, {
    systemView,
    space: await SpaceResource.fetchWorkspaceGlobalSpace(auth),
  });
  return new Ok(undefined);
}
