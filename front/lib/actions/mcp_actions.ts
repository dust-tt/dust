import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  Implementation,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_ICON,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import {
  connectToInternalMCPServer,
  getInternalMCPServerSId,
} from "@app/lib/actions/mcp_internal_actions";
import { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import {
  generateRandomModelSId,
  getResourceNameAndIdFromSId,
} from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  LightWorkspaceType,
  OAuthProvider,
  OAuthUseCase,
  Result,
} from "@app/types";
import { assertNever, Err, normalizeError, Ok } from "@app/types";

const ajv = new Ajv();

// Redeclared here to avoid an issue with the zod types in the @modelcontextprotocol/sdk
// See https://github.com/colinhacks/zod/issues/2938
const ResourceContentsSchema = z.object({
  uri: z.string(),
  mimeType: z.optional(z.string()),
});

const TextResourceContentsSchema = ResourceContentsSchema.extend({
  text: z.string(),
});

const BlobResourceContentsSchema = ResourceContentsSchema.extend({
  blob: z.string().base64(),
});

const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string().base64(),
  mimeType: z.string(),
});

const EmbeddedResourceSchema = z.object({
  type: z.literal("resource"),
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
});

const Schema = z.union([
  TextContentSchema,
  ImageContentSchema,
  EmbeddedResourceSchema,
]);

export type ToolType = ListToolsResult["tools"][number];

export type MCPToolResultContent = z.infer<typeof Schema>;

export type MCPToolMetadata = {
  name: string;
  description: string;
  inputSchema: JSONSchema | undefined;
};

const ALLOWED_ICONS = ["command", "rocket"] as const;
export type AllowedIconType = (typeof ALLOWED_ICONS)[number];

const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);

export type AuthorizationInfo = {
  provider: OAuthProvider;
  use_case: OAuthUseCase;
};

export type MCPServerMetadata = {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: AllowedIconType;
  authorization?: AuthorizationInfo;
  tools: MCPToolMetadata[];
};

function makeMCPConfigurations({
  config,
  listToolsResult,
}: {
  config: MCPServerConfigurationType;
  listToolsResult: ToolType[];
}): MCPToolConfigurationType[] {
  return listToolsResult.map((tool) => {
    return {
      id: config.id,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      mcpServerId: config.mcpServerId,
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema,
      dataSources: config.dataSources,
    };
  });
}

export const getServerTypeAndIdFromSId = (
  mcpServerId: string
): {
  serverType: "internal" | "remote";
  id: number;
} => {
  const sIdParts = getResourceNameAndIdFromSId(mcpServerId);
  if (!sIdParts) {
    throw new Error(`Invalid MCP server ID: ${mcpServerId}`);
  }

  const { resourceName, resourceId } = sIdParts;

  switch (resourceName) {
    case "internal_mcp_server":
      return { serverType: "internal" as const, id: resourceId };
    case "remote_mcp_server":
      return { serverType: "remote" as const, id: resourceId };
    default:
      throw new Error(
        `Invalid MCP server ID: ${mcpServerId} resourceName: ${resourceName}`
      );
  }
};

const connectToMCPServer = async (
  auth: Authenticator,
  {
    mcpServerId,
    remoteMCPServerUrl,
  }: {
    mcpServerId?: string;
    remoteMCPServerUrl?: string | null;
  }
) => {
  //TODO(mcp): handle failure, timeout...
  // This is where we route the MCP client to the right server.
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  if (mcpServerId) {
    const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);

    switch (serverType) {
      case "internal":
        // Create a pair of linked in-memory transports
        // And connect the client to the server.
        const [client, server] = InMemoryTransport.createLinkedPair();
        await connectToInternalMCPServer(mcpServerId, server);
        await mcpClient.connect(client);
        break;

      case "remote":
        const remoteMCPServer = await RemoteMCPServerResource.fetchById(
          auth,
          mcpServerId
        );

        if (!remoteMCPServer) {
          throw new Error(
            `Remote MCP server with remoteMCPServerId ${id} not found for remote server type.`
          );
        }

        const url = new URL(remoteMCPServer.url);
        const sseTransport = new SSEClientTransport(url);
        await mcpClient.connect(sseTransport);
        break;

      default:
        assertNever(serverType);
    }
  } else if (remoteMCPServerUrl) {
    const url = new URL(remoteMCPServerUrl);
    const sseTransport = new SSEClientTransport(url);
    await mcpClient.connect(sseTransport);
  } else {
    throw new Error("MCP server ID or URL is required.");
  }

  return mcpClient;
};

function extractMetadataFromServerVersion(
  r: Implementation | undefined
): Omit<MCPServerMetadata, "tools" | "id"> {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
      version: r.version ?? DEFAULT_MCP_ACTION_VERSION,
      authorization:
        "authorization" in r && typeof r.authorization === "object"
          ? (r.authorization as AuthorizationInfo)
          : undefined,
      description:
        "description" in r && typeof r.description === "string" && r.description
          ? r.description
          : DEFAULT_MCP_ACTION_DESCRIPTION,
      icon:
        "icon" in r && typeof r.icon === "string" && isAllowedIconType(r.icon)
          ? r.icon
          : DEFAULT_MCP_ACTION_ICON,
    };
  }

  return {
    name: DEFAULT_MCP_ACTION_NAME,
    version: DEFAULT_MCP_ACTION_VERSION,
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_ACTION_ICON,
  };
}

function extractMetadataFromTools(tools: ListToolsResult): MCPToolMetadata[] {
  return tools.tools.map((tool) => {
    let inputSchema: JSONSchema | undefined = undefined;
    if (ajv.validateSchema(tool.inputSchema)) {
      inputSchema = tool.inputSchema as JSONSchema; // unfortunately, ajv does not assert the type when returning.
    } else {
      logger.error(`[MCP] Invalid input schema for tool: ${tool.name}.`);
    }
    return {
      name: tool.name,
      description: tool.description || "",
      inputSchema,
    };
  });
}

export async function fetchRemoteServerMetaDataByURL(
  auth: Authenticator,
  url: string
): Promise<Omit<MCPServerMetadata, "id">> {
  const mcpClient = await connectToMCPServer(auth, {
    remoteMCPServerUrl: url,
  });

  try {
    const serverVersion = mcpClient.getServerVersion();
    const metadata = extractMetadataFromServerVersion(serverVersion);

    const toolsResult = await mcpClient.listTools();
    const serverTools = extractMetadataFromTools(toolsResult);

    return {
      ...metadata,
      tools: serverTools,
    };
  } finally {
    await mcpClient.close();
  }
}

/**
 * Get the metadata of the MCP server.
 *
 * This function is safe to call even if the server is remote as it will not connect to the server and use the cached metadata.
 */
export async function getMCPServerMetadataLocally(
  auth: Authenticator,
  {
    mcpServerId,
    remoteMCPServer,
  }: {
    mcpServerId: string;
    remoteMCPServer?: RemoteMCPServerResource;
  }
): Promise<MCPServerMetadata> {
  const { serverType, id } = getServerTypeAndIdFromSId(mcpServerId);
  switch (serverType) {
    case "internal":
      // For internal servers, we can connect to the server directly as it's an in-memory communication in the same process.
      const mcpClient = await connectToMCPServer(auth, { mcpServerId });

      const r = mcpClient.getServerVersion();
      const tools = await mcpClient.listTools();
      await mcpClient.close();

      return {
        id: mcpServerId,
        ...extractMetadataFromServerVersion(r),
        tools: extractMetadataFromTools(tools),
      };

    case "remote":
      // TODO(mcp): add a background job to update the metadata by calling updateRemoteMCPServerMetadata.

      let server: RemoteMCPServerResource | null = null;
      if (!remoteMCPServer) {
        server = await RemoteMCPServerResource.fetchById(auth, mcpServerId);
      } else {
        server = remoteMCPServer;
      }

      if (!server) {
        throw new Error(
          `Remote MCP server with remoteMCPServerId ${id} not found for remote server type.`
        );
      }
      if (server.id !== id) {
        throw new Error(
          `Remote MCP server id do not match ${id} !== ${server.id}`
        );
      }

      return {
        id: server.sId,
        name: server.name,
        // TODO(mcp): add version on remoteMCPServer
        version: DEFAULT_MCP_ACTION_VERSION,
        description: server.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        // TODO(mcp): add icon on remoteMCPServer
        icon: DEFAULT_MCP_ACTION_ICON,
        tools: server.cachedTools,
      };

    default:
      assertNever(serverType);
  }
}

export async function getAllMCPServersMetadataLocally(
  auth: Authenticator
): Promise<MCPServerMetadata[]> {
  const mcpServers = await Promise.all(
    AVAILABLE_INTERNAL_MCPSERVER_NAMES.map(async (internalMCPServerName) => {
      const mcpServerId = getInternalMCPServerSId(auth, {
        internalMCPServerName,
      });
      const metadata = await getMCPServerMetadataLocally(auth, {
        mcpServerId,
      });
      return metadata;
    })
  );

  return mcpServers;
}

/**
 * Try to call an MCP tool.
 *
 * This function will potentially fail if the server is remote as it will try to connect to it.
 */
export async function tryCallMCPTool(
  auth: Authenticator,
  {
    owner,
    actionConfiguration,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    actionConfiguration: MCPToolConfigurationType;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  try {
    const mcpClient = await connectToMCPServer(auth, actionConfiguration);

    const r = await mcpClient.callTool({
      name: actionConfiguration.name,
      arguments: rawInputs,
    });

    await mcpClient.close();

    if (r.isError) {
      return new Err(new Error(r.content as string));
    }

    // Type inference is not working here because of them using passthrough in the zod schema.
    const content: MCPToolResultContent[] = (r.content ??
      []) as MCPToolResultContent[];

    return new Ok(content);
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.id,
        actionConfiguration,
        error,
      },
      `Error calling MCP tool, returning error.`
    );
    return new Err(normalizeError(error));
  }
}

/**
 * Get the MCP tools for the given agent actions.
 *
 * This function will return the MCP tools for the given agent actions by connecting to the MCP server(s).
 */
export async function tryGetMCPTools(
  auth: Authenticator,
  {
    agentActions,
  }: {
    agentActions: AgentActionConfigurationType[];
  }
): Promise<MCPToolConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("mcp_actions")) {
    return [];
  }
  // Discover all the tools exposed by all the mcp server available.
  const configurations = await Promise.all(
    agentActions.filter(isMCPServerConfiguration).map(async (action) => {
      try {
        const r: ToolType[] = await listMCPServerTools(
          auth,
          action.mcpServerId
        );

        return makeMCPConfigurations({
          config: action,
          listToolsResult: r,
        });
      } catch (error) {
        logger.error(
          {
            workspaceId: owner.id,
            action,
            error,
          },
          `Error listing tools for MCP server, returning empty list.`
        );
        return [];
      }
    })
  );

  return configurations.flat();
}

export async function listMCPServerTools(
  auth: Authenticator,
  mcpServerId: string
): Promise<ToolType[]> {
  const mcpClient = await connectToMCPServer(auth, { mcpServerId });

  let allTools: ToolType[] = [];
  let nextPageCursor;
  do {
    const { tools, nextCursor } = await mcpClient.listTools();
    nextPageCursor = nextCursor;
    allTools = [...allTools, ...tools];
  } while (nextPageCursor);

  await mcpClient.close();

  return allTools;
}
