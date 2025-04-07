import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  LocalMCPServerConfigurationType,
  LocalMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  PlatformMCPServerConfigurationType,
  PlatformMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { MCPConnectionOptions } from "@app/lib/actions/mcp_metadata";
import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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
    if ("mcpServerViewId" in config) {
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
 * This function will handle both platform and local MCP tools and call the appropriate
 * specialized function based on the tool type.
 */
export async function tryCallMCPTool(
  auth: Authenticator,
  {
    owner,
    messageId,
    conversationId,
    actionConfiguration,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    messageId: string;
    conversationId: string;
    actionConfiguration: MCPToolConfigurationType;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  // Check if it's a platform MCP tool configuration.
  // TODO: Create type guards for platform and local MCP server configurations.
  if ("mcpServerViewId" in actionConfiguration) {
    return tryCallPlatformMCPTool(auth, {
      owner,
      actionConfiguration,
      rawInputs,
    });
  } else {
    // It's a local MCP tool configuration.
    return tryCallLocalMCPTool(auth, {
      owner,
      conversationId,
      messageId,
      actionConfiguration,
      rawInputs,
    });
  }
}

/**
 * Try to call a platform MCP tool.
 *
 * This function will potentially fail if the server is remote as it will try to connect to it.
 */
async function tryCallPlatformMCPTool(
  auth: Authenticator,
  {
    owner,
    actionConfiguration,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    actionConfiguration: PlatformMCPToolConfigurationType;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  try {
    const res = await MCPServerViewResource.fetchById(
      auth,
      actionConfiguration.mcpServerViewId
    );
    if (res.isErr()) {
      throw new Error(
        `MCP server view with id ${actionConfiguration.mcpServerViewId} not found.`
      );
    }
    const mcpServerView = res.value;

    const mcpClient = await connectToMCPServer(auth, {
      type: "mcpServerId",
      mcpServerId: mcpServerView.mcpServerId,
    });
    const r = await mcpClient.callTool(
      {
        name: actionConfiguration.name,
        arguments: rawInputs,
      },
      undefined,
      {
        timeout: 10000,
      }
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
      `Error calling platform MCP tool, returning error.`
    );
    return new Err(normalizeError(error));
  }
}

/**
 * Try to call a local MCP tool.
 *
 * This function handles local MCP tools that don't require a mcpServerViewId.
 */
async function tryCallLocalMCPTool(
  auth: Authenticator,
  {
    owner,
    conversationId,
    actionConfiguration,
    messageId,
    rawInputs,
  }: {
    owner: LightWorkspaceType;
    conversationId: string;
    actionConfiguration: LocalMCPToolConfigurationType;
    messageId: string;
    rawInputs: Record<string, unknown> | undefined;
  }
): Promise<Result<MCPToolResultContent[], Error>> {
  try {
    const mcpClient = await connectToMCPServer(auth, {
      type: "localMCPServerId",
      mcpServerId: actionConfiguration.mcpServerId,
      conversationId,
      messageId,
    });

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
      `Error calling local MCP tool, returning error.`
    );
    return new Err(normalizeError(error));
  }
}

async function getConnectionOptions(
  auth: Authenticator,
  config: MCPServerConfigurationType,
  {
    conversationId,
    messageId,
  }: {
    conversationId: string;
    messageId: string;
  }
): Promise<MCPConnectionOptions> {
  if (isPlatformMCPServerConfiguration(config)) {
    return {
      type: "mcpServerId",
      mcpServerId: config.mcpServerViewId,
    };
  }

  return {
    type: "localMCPServerId",
    mcpServerId: config.sId,
    conversationId,
    messageId,
  };
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
  return "mcpServerViewId" in action;
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

    // Connect to the MCP server.
    mcpClient = await connectToMCPServer(auth, connectionOptions);

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
