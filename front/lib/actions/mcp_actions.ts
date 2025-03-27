import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  Implementation,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_ICON,
  DEFAULT_MCP_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import type { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { assertNever, Err, normalizeError, Ok } from "@app/types";

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

export type MCPToolResultContent = z.infer<typeof Schema>;

export type MCPToolMetadata = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | undefined;
};

const ALLOWED_ICONS = ["command", "tool"] as const;
type AllowedIconType = (typeof ALLOWED_ICONS)[number];

const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);

export type MCPServerMetadata = {
  name: string;
  description: string;
  icon: AllowedIconType;
  tools: MCPToolMetadata[];
};

function makeMCPConfigurations({
  config,
  listToolsResult,
}: {
  config: MCPServerConfigurationType;
  listToolsResult: ListToolsResult;
}): MCPToolConfigurationType[] {
  return listToolsResult.tools.map((tool) => {
    return {
      id: config.id,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      serverType: config.serverType,
      internalMCPServerId: config.internalMCPServerId,
      remoteMCPServerId: config.remoteMCPServerId,
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema,
      dataSources: config.dataSources,
    };
  });
}

const connectToMCPServer = async ({
  serverType,
  internalMCPServerId,
  remoteMCPServerId,
  remoteMCPServerUrl,
}: {
  serverType: MCPServerConfigurationType["serverType"];
  internalMCPServerId?:
    | MCPServerConfigurationType["internalMCPServerId"]
    | null;
  remoteMCPServerId?: MCPServerConfigurationType["remoteMCPServerId"] | null;
  remoteMCPServerUrl?: string | null;
}) => {
  //TODO(mcp): handle failure, timeout...
  // This is where we route the MCP client to the right server.
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  switch (serverType) {
    case "internal":
      if (!internalMCPServerId) {
        throw new Error(
          "Internal MCP server ID is required for internal server type."
        );
      }

      // Create a pair of linked in-memory transports
      // And connect the client to the server.
      const [client, server] = InMemoryTransport.createLinkedPair();
      await connectToInternalMCPServer(internalMCPServerId, server);
      await mcpClient.connect(client);
      break;

    case "remote":
      const url = remoteMCPServerUrl
        ? new URL(remoteMCPServerUrl)
        : await (async () => {
            if (!remoteMCPServerId) {
              throw new Error(
                `Remote MCP server ID or URL is required for remote server type.`
              );
            }
            const id = getResourceIdFromSId(remoteMCPServerId);
            if (!id) {
              throw new Error(
                `Remote MCP server ID is invalid for remote server type.`
              );
            }

            const remoteMCPServer = await RemoteMCPServer.findOne({
              where: {
                id,
              },
            });

            if (!remoteMCPServer) {
              throw new Error(
                `Remote MCP server with remoteMCPServerId ${remoteMCPServerId} not found for remote server type.`
              );
            }

            return new URL(remoteMCPServer.url);
          })();

      const sseTransport = new SSEClientTransport(url);
      await mcpClient.connect(sseTransport);
      break;

    default:
      assertNever(serverType);
  }

  return mcpClient;
};

function extractMetadataFromServerVersion(
  r: Implementation | undefined
): Omit<MCPServerMetadata, "tools"> {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
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
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_ACTION_ICON,
  };
}

function extractMetadataFromTools(tools: ListToolsResult): MCPToolMetadata[] {
  return tools.tools.map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema.properties
      ? (JSON.parse(JSON.stringify(tool.inputSchema.properties)) as Record<
          string,
          unknown
        >)
      : undefined,
  }));
}

export async function fetchRemoteServerMetaDataByURL(
  url: string
): Promise<MCPServerMetadata> {
  const mcpClient = await connectToMCPServer({
    serverType: "remote",
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
  config:
    | {
        serverType: "internal";
        internalMCPServerId: MCPServerConfigurationType["internalMCPServerId"];
      }
    | {
        serverType: "remote";
        remoteMCPServer: RemoteMCPServerResource;
      }
): Promise<MCPServerMetadata> {
  const { serverType } = config;
  switch (serverType) {
    case "internal":
      // For internal servers, we can connect to the server directly as it's an in-memory communication in the same process.
      const mcpClient = await connectToMCPServer({
        serverType: config.serverType,
        internalMCPServerId: config.internalMCPServerId,
      });

      const r = await mcpClient.getServerVersion();
      const tools = await mcpClient.listTools();
      await mcpClient.close();

      return {
        ...extractMetadataFromServerVersion(r),
        tools: extractMetadataFromTools(tools),
      };

    case "remote":
      // TODO(mcp): add a background job to update the metadata by calling updateRemoteMCPServerMetadata.
      const { remoteMCPServer } = config;
      return {
        name: remoteMCPServer.name,
        description:
          remoteMCPServer.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        // TODO(mcp): add icon on remoteMCPServer
        icon: DEFAULT_MCP_ACTION_ICON,
        tools: remoteMCPServer.cachedTools,
      };

    default:
      assertNever(serverType);
  }
}

/**
 * Try to call a MCP tool.
 *
 * This function will potentially fail if the server is remote as it will try to connect to it.
 */
export async function tryCallMCPTool({
  owner,
  actionConfiguration,
  rawInputs,
}: {
  owner: LightWorkspaceType;
  actionConfiguration: MCPToolConfigurationType;
  rawInputs: Record<string, unknown> | undefined;
}): Promise<Result<MCPToolResultContent[], Error>> {
  try {
    const mcpClient = await connectToMCPServer(actionConfiguration);

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
        // Connect to the MCP server.
        const mcpClient = await connectToMCPServer(action);

        const r: ListToolsResult = await mcpClient.listTools();

        // Close immediately after listing tools.
        await mcpClient.close();

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
