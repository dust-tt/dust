import {
  ConfigurableToolInputJSONSchemas,
  INTERNAL_MIME_TYPES,
} from "@dust-tt/client";
import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { DEFAULT_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type {
  LocalMCPServerConfigurationType,
  LocalMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  PlatformMCPServerConfigurationType,
  PlatformMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { isDefaultInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPConnectionParams } from "@app/lib/actions/mcp_metadata";
import {
  connectToMCPServer,
  extractMetadataFromTools,
  isConnectViaMCPServerId,
} from "@app/lib/actions/mcp_metadata";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPServerConfiguration,
  isPlatformMCPServerConfiguration,
  isPlatformMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type { MCPToolType, MCPToolWithStakeLevelType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { findMatchingSchemaKeys } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  Result,
  SupportedFileContentType,
} from "@app/types";
import { FILE_FORMATS } from "@app/types";
import { assertNever, Err, normalizeError, Ok, slugify } from "@app/types";

const MAX_OUTPUT_ITEMS = 128;

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 60 * 1000; // 1 minute.

const EMPTY_INPUT_SCHEMA: JSONSchema7 = { type: "object", properties: {} };

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

const ActionGeneratedFileSchema = z.object({
  type: z.literal("resource"),
  resource: z.object({
    text: z.string(),
    uri: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE),
    fileId: z.string(),
    title: z.string(),
    contentType: z.enum(
      Object.keys(FILE_FORMATS) as [
        SupportedFileContentType,
        ...SupportedFileContentType[],
      ]
    ),
    snippet: z.string().nullable(),
  }),
});

export type ActionGeneratedFile = z.infer<typeof ActionGeneratedFileSchema>;

export function isActionGeneratedFile(
  content: MCPToolResultContent
): content is ActionGeneratedFile {
  return (
    content.type === "resource" &&
    content.resource.mimeType === INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE
  );
}

const MCPToolResultContentSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  EmbeddedResourceSchema,
  ActionGeneratedFileSchema,
]);

export type MCPToolResultContent = z.infer<typeof MCPToolResultContentSchema>;

export type MCPToolResult = {
  isError: boolean;
  content: MCPToolResultContent[];
};

function makePlatformMCPToolConfigurations(
  config: PlatformMCPServerConfigurationType,
  tools: MCPToolWithStakeLevelType[]
): PlatformMCPToolConfigurationType[] {
  return tools.map((tool) => ({
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: tool.name,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema || EMPTY_INPUT_SCHEMA,
    id: config.id,
    mcpServerViewId: config.mcpServerViewId,
    dataSources: config.dataSources || [], // Ensure dataSources is always an array
    tables: config.tables,
    isDefault: tool.isDefault,
    childAgentId: config.childAgentId,
    additionalConfiguration: config.additionalConfiguration,
    permission: tool.stakeLevel,
    toolServerId: tool.toolServerId,
  }));
}

function makeLocalMCPToolConfigurations(
  config: LocalMCPServerConfigurationType,
  tools: MCPToolType[]
): LocalMCPToolConfigurationType[] {
  return tools.map((tool) => ({
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: tool.name,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema || EMPTY_INPUT_SCHEMA,
    id: config.id,
    localMcpServerId: config.localMcpServerId,
    isDefault: false, // can't be default for local MCP servers.
  }));
}

type MCPToolConfigurationResult<T> =
  T extends PlatformMCPServerConfigurationType
    ? PlatformMCPToolConfigurationType[]
    : LocalMCPToolConfigurationType[];

function makeMCPToolConfigurations<T extends MCPServerConfigurationType>({
  config,
  tools,
}: {
  config: T;
  tools: MCPToolWithStakeLevelType[];
}): MCPToolConfigurationResult<T> {
  if (isPlatformMCPServerConfiguration(config)) {
    return makePlatformMCPToolConfigurations(
      config,
      tools
    ) as MCPToolConfigurationResult<T>;
  }

  return makeLocalMCPToolConfigurations(
    config,
    tools
  ) as MCPToolConfigurationResult<T>;
}

/**
 * Try to call an MCP tool.
 *
 * May fail when connecting to remote/client-side servers.
 */
export async function tryCallMCPTool(
  auth: Authenticator,
  {
    messageId,
    actionConfiguration,
    inputs,
    agentConfiguration,
    conversation,
    agentMessage,
  }: {
    messageId: string;
    actionConfiguration: MCPToolConfigurationType;
    inputs: Record<string, unknown> | undefined;
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
  }
): Promise<Result<MCPToolResult["content"], Error>> {
  const connectionParamsRes = await getMCPClientConnectionParams(
    auth,
    actionConfiguration,
    {
      conversationId: conversation.sId,
      messageId,
    }
  );
  if (connectionParamsRes.isErr()) {
    return connectionParamsRes;
  }

  let mcpClient;
  try {
    const r = await connectToMCPServer(auth, connectionParamsRes.value, {
      agentConfiguration,
      conversation,
      agentMessage,
      actionConfiguration,
    });
    if (r.isErr()) {
      return r;
    }
    mcpClient = r.value;

    const toolCallResult = await mcpClient.callTool(
      {
        name: actionConfiguration.originalName,
        arguments: inputs,
      },
      undefined,
      { timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS }
    );

    // Do not raise an error here as it will break the conversation.
    // Let the model decide what to do.
    if (toolCallResult.isError) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId: conversation.sId,
          messageId,
          error: toolCallResult.error,
        },
        `Error calling MCP tool`
      );
    }
    // Type inference is not working here because of them using passthrough in the zod schema.
    const content: MCPToolResultContent[] = (toolCallResult.content ??
      []) as MCPToolResultContent[];

    if (content.length >= MAX_OUTPUT_ITEMS) {
      return new Err(
        new Error(
          `Too many output items: ${content.length} (max is ${MAX_OUTPUT_ITEMS})`
        )
      );
    }

    // TODO(mcp) refuse if the content is too large

    return new Ok(content);
  } catch (error) {
    return new Err(normalizeError(error));
  } finally {
    await mcpClient?.close();
  }
}

async function getMCPClientConnectionParams(
  auth: Authenticator,
  config: MCPServerConfigurationType | MCPToolConfigurationType,
  {
    conversationId,
    messageId,
  }: {
    conversationId: string;
    messageId: string;
  }
): Promise<Result<MCPConnectionParams, Error>> {
  if (
    isPlatformMCPServerConfiguration(config) ||
    isPlatformMCPToolConfiguration(config)
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
      mcpServerId: res.value.mcpServerId,
    });
  }

  return new Ok({
    type: "localMCPServerId",
    mcpServerId: config.localMcpServerId,
    conversationId,
    messageId,
  });
}

function getPrefixedToolName(
  config: MCPServerConfigurationType,
  originalName: string
): string {
  const slugifiedConfigName = slugify(config.name);
  const slugifiedOriginalName = slugify(originalName);
  const separator = "___";
  const MAX_SIZE = 64;

  const prefixedName = `${slugifiedConfigName}${separator}${slugifiedOriginalName}`;

  // If the prefixed name is too long, we try to shorten the config name
  if (prefixedName.length > MAX_SIZE) {
    const maxLength =
      MAX_SIZE - separator.length - slugifiedOriginalName.length;
    // with a minimum of 4 characters.
    if (maxLength > 4) {
      return `${slugifiedConfigName.slice(0, maxLength)}${separator}${slugifiedOriginalName}`;
    } else {
      // Otherwise, we just use the original name.
      return slugifiedOriginalName;
    }
  }

  return prefixedName;
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
      let tools: MCPToolWithStakeLevelType[] = [];
      const toolsRes = await listMCPServerTools(auth, action, {
        conversationId,
        messageId,
      });
      if (toolsRes.isErr()) {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId,
            messageId,
            error: toolsRes.error,
          },
          `Error listing tools from MCP server: ${normalizeError(toolsRes.error)}`
        );
        return [];
      }

      tools = toolsRes.value;

      const toolConfigurations = makeMCPToolConfigurations({
        config: action,
        tools,
      });

      // This handles the case where the MCP server configuration is using pre-configured data sources
      // or tables.
      // We add the description of the data sources or tables to the tool description so that the model
      // has more information to make the right choice.
      // This replicates the current behavior of the Retrieval action for example.
      let extraDescription: string = "";

      // Only do it when there is a single tool configuration as we only have one description to add.
      if (toolConfigurations.length === 1 && action.description) {
        const hasDataSourceConfiguration =
          findMatchingSchemaKeys(
            toolConfigurations[0].inputSchema,
            ConfigurableToolInputJSONSchemas[
              INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
            ]
          ).length > 0;

        const hasTableConfiguration =
          findMatchingSchemaKeys(
            toolConfigurations[0].inputSchema,
            ConfigurableToolInputJSONSchemas[
              INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE
            ]
          ).length > 0;

        if (hasDataSourceConfiguration && hasTableConfiguration) {
          // Might be confusing for the model if we end up in this situation,
          // which is not a use case we have now.
          extraDescription += `\nDescription of the data sources and tables:\n${action.description}`;
        } else if (hasDataSourceConfiguration) {
          extraDescription += `\nDescription of the data sources:\n${action.description}`;
        } else if (hasTableConfiguration) {
          extraDescription += `\nDescription of the tables:\n${action.description}`;
        }
      }

      return toolConfigurations.map((toolConfig) => {
        const prefixedName = getPrefixedToolName(action, toolConfig.name);

        return {
          ...toolConfig,
          originalName: toolConfig.name,
          mcpServerName: action.name,
          name: prefixedName,
          description: toolConfig.description + extraDescription,
        };
      });
    })
  );

  return configurations.flat();
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
): Promise<Result<MCPToolWithStakeLevelType[], Error>> {
  const owner = auth.getNonNullableWorkspace();
  let mcpClient;

  const connectionParamsRes = await getMCPClientConnectionParams(auth, config, {
    conversationId,
    messageId,
  });

  if (connectionParamsRes.isErr()) {
    return connectionParamsRes;
  }

  try {
    // Connect to the MCP server.
    const connectionParams = connectionParamsRes.value;
    const r = await connectToMCPServer(auth, connectionParams);
    if (r.isErr()) {
      return r;
    }
    mcpClient = r.value;
    const isDefault =
      isConnectViaMCPServerId(connectionParams) &&
      isDefaultInternalMCPServer(connectionParams.mcpServerId);

    let allTools: MCPToolWithStakeLevelType[] = [];
    let nextPageCursor;

    // Fetch all tools, handling pagination if supported by the MCP server.
    do {
      const { tools, nextCursor } = await mcpClient.listTools();
      nextPageCursor = nextCursor;
      allTools = [
        ...allTools,
        ...extractMetadataFromTools(tools).map((tool) => ({
          ...tool,
          isDefault,
        })),
      ];
    } while (nextPageCursor);

    // Enrich tool metadata with permissions and serverId to avoid re-fetching at validation modal
    // level.
    if (connectionParams.type === "mcpServerId") {
      const { serverType, id } = getServerTypeAndIdFromSId(
        connectionParams.mcpServerId
      );

      let toolsMetadata: Record<string, MCPToolStakeLevelType> = {};
      switch (serverType) {
        case "internal":
          toolsMetadata =
            InternalMCPServerInMemoryResource.getToolsConfigByServerId(
              connectionParams.mcpServerId
            );
          break;
        case "remote":
          toolsMetadata = (
            await RemoteMCPServerToolMetadataResource.fetchByServerId(auth, id)
          ).reduce<Record<string, MCPToolStakeLevelType>>((acc, metadata) => {
            acc[metadata.toolName] = metadata.permission;
            return acc;
          }, {});
          break;
        default:
          assertNever(serverType);
      }

      allTools = allTools.map((tool) => ({
        ...tool,
        stakeLevel: toolsMetadata[tool.name] || DEFAULT_MCP_TOOL_STAKE_LEVEL,
        toolServerId: connectionParams.mcpServerId,
      }));
    }

    logger.debug(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        toolCount: allTools.length,
      },
      `Retrieved ${allTools.length} tools from MCP server`
    );

    return new Ok(allTools);
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        error,
      },
      `Error listing tools from MCP server: ${normalizeError(error)}`
    );
    return new Err(normalizeError(error));
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
