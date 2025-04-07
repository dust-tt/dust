import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  LocalMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  PlatformMCPServerConfigurationType,
  PlatformMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { MCPConnectionOptions } from "@app/lib/actions/mcp_metadata";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPActionConfiguration,
  isMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 60 * 1000; // 1 minute.

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

function makeMCPConfigurations<T extends MCPServerConfigurationType>({
  config,
  listToolsResult,
}: {
  config: T;
  listToolsResult: ToolType[];
}): T extends PlatformMCPServerConfigurationType
  ? PlatformMCPToolConfigurationType[]
  : LocalMCPToolConfigurationType[] {
  return listToolsResult.map((tool) => {
    // Create a base configuration.
    const baseConfig: LocalMCPToolConfigurationType = {
      // Local MCP Tool configuration uses the serverId as the id.
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema,
      id: config.id,
      mcpServerId: config.sId,
    };

    // Add platform-specific properties if platform config.
    if (isPlatformMCPServerConfiguration(config)) {
      const platformConfig: PlatformMCPToolConfigurationType = {
        ...baseConfig,
        sId: generateRandomModelSId(),
        mcpServerViewId: config.mcpServerViewId,
        dataSources: config.dataSources,
      };

      return platformConfig;
    }

    return baseConfig;
  }) as T extends PlatformMCPServerConfigurationType
    ? PlatformMCPToolConfigurationType[]
    : LocalMCPToolConfigurationType[];
}

/**
 * Try to call an MCP tool.
 *
 * This function will handle both platform and local MCP tools.
 */
export async function tryCallMCPTool(
  auth: Authenticator,
  {
    owner,
    conversationId,
    messageId,
    actionConfiguration,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    conversationId: string;
    messageId: string;
    actionConfiguration: MCPToolConfigurationType;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  const connectionOptions = await getConnectionOptions(
    auth,
    actionConfiguration,
    {
      conversationId,
      messageId,
    }
  );

  if (connectionOptions.isErr()) {
    return connectionOptions;
  }

  try {
    const mcpClient = await connectToMCPServer(auth, connectionOptions.value);

    const r = await mcpClient.callTool(
      {
        name: actionConfiguration.name,
        arguments: rawInputs,
      },
      undefined,
      { timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS }
    );

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

async function getConnectionOptions(
  auth: Authenticator,
  config: MCPServerConfigurationType | MCPToolConfigurationType,
  {
    conversationId,
    messageId,
  }: {
    conversationId: string;
    messageId: string;
  }
): Promise<Result<MCPConnectionOptions, Error>> {
  if (
    (isMCPServerConfiguration(config) &&
      isPlatformMCPServerConfiguration(config)) ||
    (isMCPActionConfiguration(config) && isPlatformMCPToolConfiguration(config))
  ) {
    const res = await MCPServerViewResource.fetchById(
      auth,
      config.mcpServerViewId
    );
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      type: "mcpServerId",
      mcpServerId: config.mcpServerViewId,
    });
  }

  return new Ok({
    type: "localMCPServerId",
    mcpServerId: isMCPActionConfiguration(config)
      ? config.mcpServerId
      : config.sId,
    conversationId,
    messageId,
  });
}

/**
 * List the MCP tools for the given agent actions.
 * Returns MCP tools by connecting to the specified MCP servers.
 */
export async function tryListMCPTools(
  auth: Authenticator,
  {
    agentActions,
    conversationId,
    messageId,
  }: {
    agentActions: AgentActionConfigurationType[];
    conversationId: string;
    messageId: string;
  }
): Promise<MCPToolConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("mcp_actions")) {
    return [];
  }

  // Filter for MCP server configurations.
  const mcpServerActions = agentActions.filter(isMCPServerConfiguration);

  // Discover all the tools exposed by all the mcp servers available.
  const configurations = await Promise.all(
    mcpServerActions.map(async (action) => {
      const tools = await listMCPServerTools(auth, action, {
        conversationId,
        messageId,
      });

      return makeMCPConfigurations({
        config: action,
        listToolsResult: tools,
      });
    })
  );

  return configurations.flat();
}

function isPlatformMCPServerConfiguration(
  action: AgentActionConfigurationType
): action is PlatformMCPServerConfigurationType {
  return (
    action.type === "mcp_server_configuration" && "mcpServerViewId" in action
  );
}

function isPlatformMCPToolConfiguration(
  action: MCPToolConfigurationType
): action is PlatformMCPToolConfigurationType {
  return action.type === "mcp_configuration" && "mcpServerViewId" in action;
}

async function listMCPServerTools(
  auth: Authenticator,
  config: MCPServerConfigurationType,
  {
    conversationId,
    messageId,
  }: {
    conversationId: string;
    messageId: string;
  }
): Promise<ToolType[]> {
  const owner = auth.getNonNullableWorkspace();
  let mcpClient;

  try {
    const connectionOptions = await getConnectionOptions(auth, config, {
      conversationId,
      messageId,
    });

    if (connectionOptions.isErr()) {
      throw connectionOptions.error;
    }

    // Connect to the MCP server.
    mcpClient = await connectToMCPServer(auth, connectionOptions.value);

    let allTools: ToolType[] = [];
    let nextPageCursor;

    // Fetch all tools, handling pagination if supported by the MCP server.
    do {
      const { tools, nextCursor } = await mcpClient.listTools();
      nextPageCursor = nextCursor;
      allTools = [...allTools, ...tools];
    } while (nextPageCursor);

    logger.debug(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        toolCount: allTools.length,
      },
      `Retrieved ${allTools.length} tools from MCP server`
    );

    return allTools;
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        error,
      },
      `Error listing tools from MCP server: ${error}`
    );
    throw error;
  } finally {
    // Ensure we always close the client connection
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch (closeError) {
        logger.warn(
          {
            workspaceId: owner.id,
            conversationId,
            messageId,
            error: closeError,
          },
          "Error closing MCP client connection"
        );
      }
    }
  }
}
