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
import type { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { RemoteMCPServer } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
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

export type ToolType = ListToolsResult["tools"][number];

export interface MCPServerConnectionDetails {
  serverType: MCPServerConfigurationType["serverType"];
  internalMCPServerId?:
    | MCPServerConfigurationType["internalMCPServerId"]
    | null;
  remoteMCPServerId?: MCPServerConfigurationType["remoteMCPServerId"] | null;
}

export type MCPToolResultContent = z.infer<typeof Schema>;

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

            const remoteMCPServer = await RemoteMCPServer.findOne({
              where: {
                sId: remoteMCPServerId,
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

function extractMetadataFromServerVersion(r: Implementation | undefined): {
  name: string;
  description: string;
} {
  return {
    name: r?.name ?? DEFAULT_MCP_ACTION_NAME,
    description:
      (r && "description" in r && typeof r.description === "string"
        ? r.description
        : DEFAULT_MCP_ACTION_DESCRIPTION) ?? DEFAULT_MCP_ACTION_DESCRIPTION,
  };
}

export async function fetchServerData(url: string) {
  const mcpClient = await connectToMCPServer({
    serverType: "remote",
    remoteMCPServerUrl: url,
  });

  try {
    const serverVersion = mcpClient.getServerVersion();
    const metadata = extractMetadataFromServerVersion(serverVersion);

    const toolsResult = await mcpClient.listTools();
    const serverTools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
    }));

    return {
      name: metadata.name,
      description: metadata.description,
      tools: serverTools,
    };
  } finally {
    await mcpClient.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateRemoteMCPServerMetadata(config: {
  serverType: "remote";
  remoteMCPServerId: string;
}) {
  const remoteMCPServer = await RemoteMCPServer.findOne({
    where: {
      sId: config.remoteMCPServerId,
    },
  });

  if (!remoteMCPServer) {
    throw new Error(
      `Remote MCP server with remoteMCPServerId ${config.remoteMCPServerId} not found.`
    );
  }

  const mcpClient = await connectToMCPServer(config);
  const r = await mcpClient.getServerVersion();
  await mcpClient.close();

  const metadata = extractMetadataFromServerVersion(r);

  await remoteMCPServer.update(metadata);
}

/**
 * Get the metadata of the MCP server.
 *
 * This function is safe to call even if the server is remote as it will not connect to the server and use the cached metadata.
 */
export async function getMCPServerMetadata(
  config: AgentMCPServerConfiguration
): Promise<{
  name: string;
  description: string;
}> {
  switch (config.serverType) {
    case "internal":
      // For internal servers, we can connect to the server directly as it's an in-memory communication in the same process.
      const mcpClient = await connectToMCPServer({
        serverType: config.serverType,
        internalMCPServerId: config.internalMCPServerId,
      });

      const r = await mcpClient.getServerVersion();
      await mcpClient.close();

      return extractMetadataFromServerVersion(r);
    case "remote":
      if (!config.remoteMCPServerId) {
        throw new Error(
          `Remote MCP server ID is required for remote server type.`
        );
      }

      const remoteMCPServer = await RemoteMCPServer.findByPk(
        config.remoteMCPServerId
      );

      if (!remoteMCPServer) {
        throw new Error(
          `Remote MCP server with remoteMCPServerId ${config.sId} not found.`
        );
      }

      // TODO(mcp): add a background job to update the metadata by calling updateRemoteMCPServerMetadata.

      return {
        name: remoteMCPServer.name,
        description:
          remoteMCPServer.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
      };

    default:
      assertNever(config.serverType);
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

        const r: ToolType[] = await listMCPServerTools({
          serverType: action.serverType,
          internalMCPServerId: action.internalMCPServerId,
          remoteMCPServerId: action.remoteMCPServerId,
        });

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

export async function listMCPServerTools(
  connectionDetails: MCPServerConnectionDetails
): Promise<ToolType[]> {
  const mcpClient = await connectToMCPServer(connectionDetails);

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
