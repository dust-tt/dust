import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpError } from "@modelcontextprotocol/sdk/types.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import EventEmitter from "events";
import type { JSONSchema7 } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL,
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
} from "@app/lib/actions/constants";
import type {
  LocalMCPServerConfigurationType,
  LocalMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  PlatformMCPServerConfigurationType,
  PlatformMCPToolConfigurationType,
  WithToolNameMetadata,
} from "@app/lib/actions/mcp";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  getInternalMCPServerAvailability,
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  MCPProgressNotificationType,
  MCPToolResult,
  MCPToolResultContentType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isMCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  MCPConnectionParams,
  PlatformMCPConnectionParams,
} from "@app/lib/actions/mcp_metadata";
import {
  connectToMCPServer,
  extractMetadataFromTools,
  isConnectViaLocalMCPServer,
  isConnectViaMCPServerId,
} from "@app/lib/actions/mcp_metadata";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPActionConfiguration,
  isMCPServerConfiguration,
  isPlatformMCPServerConfiguration,
  isPlatformMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type {
  LocalMCPToolTypeWithStakeLevel,
  MCPToolType,
  PlatformMCPToolTypeWithStakeLevel,
} from "@app/lib/api/mcp";
import { MCP_PROGRESS_TOKEN } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { fromEvent } from "@app/lib/utils/events";
import { findMatchingSubSchemas } from "@app/lib/utils/json_schemas";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { assertNever, Err, normalizeError, Ok, slugify } from "@app/types";

const MAX_OUTPUT_ITEMS = 128;

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes.

const MCP_NOTIFICATION_EVENT_NAME = "mcp-notification";
const MCP_TOOL_DONE_EVENT_NAME = "TOOL_DONE" as const;

const EMPTY_INPUT_SCHEMA: JSONSchema7 = { type: "object", properties: {} };

const MAX_TOOL_NAME_LENGTH = 64;

const TOOL_NAME_SEPARATOR = "___";

function makePlatformMCPToolConfigurations(
  config: PlatformMCPServerConfigurationType,
  tools: PlatformMCPToolTypeWithStakeLevel[]
): WithToolNameMetadata<PlatformMCPToolConfigurationType>[] {
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
    availability: tool.availability,
    childAgentId: config.childAgentId,
    reasoningModel: config.reasoningModel,
    timeFrame: config.timeFrame,
    additionalConfiguration: config.additionalConfiguration,
    permission: tool.stakeLevel,
    toolServerId: tool.toolServerId,
    originalName: tool.name,
    mcpServerName: config.name,
  }));
}

function makeLocalMCPToolConfigurations(
  config: LocalMCPServerConfigurationType,
  tools: LocalMCPToolTypeWithStakeLevel[]
): WithToolNameMetadata<LocalMCPToolConfigurationType>[] {
  return tools.map((tool) => ({
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: tool.name,
    description: tool.description ?? null,
    inputSchema: tool.inputSchema || EMPTY_INPUT_SCHEMA,
    id: config.id,
    localMcpServerId: config.localMcpServerId,
    availability: "manual", // can't be auto for local MCP servers.
    originalName: tool.name,
    mcpServerName: config.name,
  }));
}

type MCPCallToolEvent =
  | {
      type: "notification";
      notification: MCPProgressNotificationType;
    }
  | {
      type: "result";
      result: Result<MCPToolResult["content"], Error | McpError>;
    };

/**
 * Try to call an MCP tool.
 *
 * May fail when connecting to remote/client-side servers.
 */
export async function* tryCallMCPTool(
  auth: Authenticator,
  inputs: Record<string, unknown> | undefined,
  agentLoopContext: AgentLoopContextType
): AsyncGenerator<MCPCallToolEvent, void> {
  if (!isMCPActionConfiguration(agentLoopContext.actionConfiguration)) {
    yield {
      type: "result",
      result: new Err(
        new Error(
          "Invalid action configuration: not an MCP action configuration"
        )
      ),
    };

    return;
  }

  const connectionParamsRes = await getMCPClientConnectionParams(
    auth,
    agentLoopContext.actionConfiguration,
    {
      conversationId: agentLoopContext.conversation.sId,
      messageId: agentLoopContext.agentMessage.sId,
    }
  );
  if (connectionParamsRes.isErr()) {
    yield {
      type: "result",
      result: connectionParamsRes,
    };
    return;
  }

  let mcpClient;
  try {
    const r = await connectToMCPServer(
      auth,
      connectionParamsRes.value,
      agentLoopContext
    );
    if (r.isErr()) {
      yield {
        type: "result",
        result: r,
      };
      return;
    }
    mcpClient = r.value;

    const emitter = new EventEmitter();

    // Convert the emitter to an async generator.
    const notificationStream = fromEvent<MCPProgressNotificationType>(
      emitter,
      MCP_NOTIFICATION_EVENT_NAME
    );

    // Subscribe to notifications before calling the tool.
    // Longer term we should use the `onprogress` callback of the `callTool` method. Right now,
    // `progressToken` is not accessible in the `ToolCallback` interface. PR has been merged, but
    // not released yet (https://github.com/modelcontextprotocol/typescript-sdk/pull/328).
    mcpClient.setNotificationHandler(
      ProgressNotificationSchema,
      async (notification) => {
        // For now, we only handle internal notifications.
        // TODO(MCP 2025-04-30): Add rate limiting.
        if (isMCPProgressNotificationType(notification)) {
          emitter.emit(MCP_NOTIFICATION_EVENT_NAME, notification);
        }
      }
    );

    // Start the tool call in parallel.
    const toolPromise = mcpClient.callTool(
      {
        name: agentLoopContext.actionConfiguration.originalName,
        arguments: inputs,
        progressToken: MCP_PROGRESS_TOKEN,
      },
      undefined,
      {
        timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS,
      }
    );

    // Read from notificationStream and yield events until the tool is done.
    let toolDone = false;
    while (!toolDone) {
      const notificationOrDone = await Promise.race([
        notificationStream.next(), // Next notification.
        toolPromise.then(() => MCP_TOOL_DONE_EVENT_NAME), // Or tool fully completes.
      ]);

      // If the tool completed, break from the loop and stop reading notifications.
      if (notificationOrDone === MCP_TOOL_DONE_EVENT_NAME) {
        toolDone = true;
      } else {
        const iteratorResult = notificationOrDone;
        if (iteratorResult.done) {
          // The notifications ended prematurely.
          break;
        }

        yield {
          type: "notification",
          notification: iteratorResult.value,
        };
      }
    }

    // Tool is done now, wait for the actual result.
    const toolCallResult = await toolPromise;
    // Do not raise an error here as it will break the conversation.
    // Let the model decide what to do.
    if (toolCallResult.isError) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          conversationId: agentLoopContext.conversation.sId,
          messageId: agentLoopContext.agentMessage.sId,
          error: toolCallResult.content,
        },
        `Error calling MCP tool in tryCallMCPTool().`
      );
    }
    // Type inference is not working here because of them using passthrough in the zod schema.
    const content: MCPToolResultContentType[] = (toolCallResult.content ??
      []) as MCPToolResultContentType[];

    if (content.length >= MAX_OUTPUT_ITEMS) {
      yield {
        type: "result",
        result: new Err(
          new Error(
            `Too many output items: ${content.length} (max is ${MAX_OUTPUT_ITEMS})`
          )
        ),
      };
    }

    // TODO(mcp) refuse if the content is too large

    yield {
      type: "result",
      result: new Ok(content),
    };
  } catch (error) {
    yield {
      type: "result",
      result: new Err(normalizeError(error)),
    };
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
    const mcpServerView = await MCPServerViewResource.fetchById(
      auth,
      config.mcpServerViewId
    );
    if (!mcpServerView) {
      return new Err(new Error("MCP server view not found"));
    }

    return new Ok({
      type: "mcpServerId",
      mcpServerId: mcpServerView.mcpServerId,
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
): Result<string, Error> {
  const slugifiedConfigName = slugify(config.name);
  const slugifiedOriginalName = slugify(originalName);

  const prefixedName = `${slugifiedConfigName}${TOOL_NAME_SEPARATOR}${slugifiedOriginalName}`;

  // If the prefixed name is too long, we return the unprefixed original name directly.
  if (prefixedName.length >= MAX_TOOL_NAME_LENGTH) {
    if (slugifiedOriginalName.length >= MAX_TOOL_NAME_LENGTH) {
      return new Err(
        new Error(
          `Tool name too long: ${originalName} (max length is ${MAX_TOOL_NAME_LENGTH})`
        )
      );
    }
    return new Ok(slugifiedOriginalName);
  }

  return new Ok(prefixedName);
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
): Promise<{ tools: MCPToolConfigurationType[]; error?: string }> {
  const owner = auth.getNonNullableWorkspace();

  // Filter for MCP server configurations.
  const mcpServerActions = agentActions.filter(isMCPServerConfiguration);

  // Discover all the tools exposed by all the mcp servers available.
  const toolsResults = await concurrentExecutor(
    mcpServerActions,
    async (action) => {
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
        return new Err(
          new Error(
            `An error occured while listing the available tools for ${action.name}. ` +
              "Tools from this server are not available for this message. " +
              "Inform the user of this issue."
          )
        );
      }

      const toolConfigurations = toolsRes.value;

      // This handles the case where the MCP server configuration is using pre-configured data sources
      // or tables.
      // We add the description of the data sources or tables to the tool description so that the model
      // has more information to make the right choice.
      // This replicates the current behavior of the Retrieval action for example.
      let extraDescription: string = "";

      // Only do it when there is a single tool configuration as we only have one description to add.
      if (toolConfigurations.length === 1 && action.description) {
        const hasDataSourceConfiguration =
          Object.keys(
            findMatchingSubSchemas(
              toolConfigurations[0].inputSchema,
              INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
            )
          ).length > 0;

        const hasTableConfiguration =
          Object.keys(
            findMatchingSubSchemas(
              toolConfigurations[0].inputSchema,
              INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE
            )
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

      const tools = [];

      for (const toolConfig of toolConfigurations) {
        const toolName = getPrefixedToolName(action, toolConfig.name);
        // If we fail here we fail for the entire action because the tool potentially interact
        // so we end up with a weird state if some of them are added and some are not.
        // It's more principled to reject the action altogether in this case.
        if (toolName.isErr()) {
          return new Err(toolName.error);
        }
        tools.push({
          ...toolConfig,
          originalName: toolConfig.name,
          mcpServerName: action.name,
          name: toolName.value,
          description: toolConfig.description + extraDescription,
        });
      }

      return new Ok(tools);
    },
    { concurrency: 10 }
  );

  // Aggregate results
  const { tools, errors } = toolsResults.reduce<{
    tools: MCPToolConfigurationType[];
    errors: string[];
  }>(
    (acc, result) => {
      if (result.isOk()) {
        acc.tools.push(...result.value);
      } else {
        acc.errors.push(result.error.message);
      }
      return acc;
    },
    { tools: [], errors: [] }
  );

  return {
    tools,
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}

async function listToolsForLocalMCPServer(
  mcpClient: Client,
  config: LocalMCPServerConfigurationType
): Promise<Result<MCPToolConfigurationType[], Error>> {
  let allTools: LocalMCPToolTypeWithStakeLevel[] = [];
  let nextPageCursor;

  // Fetch all tools, handling pagination if supported by the MCP server.
  do {
    const { tools, nextCursor } = await mcpClient.listTools();

    for (const t of tools) {
      t.inputSchema;
    }

    nextPageCursor = nextCursor;
    allTools = [
      ...allTools,
      ...extractMetadataFromTools(tools).map((tool) => ({
        ...tool,
        availability: "manual" as const,
        stakeLevel: FALLBACK_MCP_TOOL_STAKE_LEVEL,
      })),
    ];
  } while (nextPageCursor);

  // Create the configurations directly here
  const localToolConfigs = makeLocalMCPToolConfigurations(config, allTools);
  return new Ok(localToolConfigs);
}

async function listToolsForPlatformMCPServer(
  auth: Authenticator,
  connectionParams: PlatformMCPConnectionParams,
  mcpClient: Client,
  config: PlatformMCPServerConfigurationType
): Promise<Result<MCPToolConfigurationType[], Error>> {
  let allToolsRaw: MCPToolType[] = [];
  let nextPageCursor;

  // Fetch all tools, handling pagination if supported by the MCP server.
  do {
    const { tools, nextCursor } = await mcpClient.listTools();
    nextPageCursor = nextCursor;
    allToolsRaw = [
      ...allToolsRaw,
      ...extractMetadataFromTools(tools).map((tool) => ({
        ...tool,
      })),
    ];
  } while (nextPageCursor);

  if (!isConnectViaMCPServerId(connectionParams)) {
    const rawTools = allToolsRaw.map((tool) => ({
      ...tool,
      stakeLevel: FALLBACK_MCP_TOOL_STAKE_LEVEL,
      availability: "manual" as const,
      toolServerId: "",
    }));

    // Create configurations and add required properties
    const platformToolConfigs = makePlatformMCPToolConfigurations(
      config,
      rawTools
    );
    return new Ok(platformToolConfigs);
  }

  const availability = getInternalMCPServerAvailability(
    connectionParams.mcpServerId
  );
  const { serverType, id } = getServerTypeAndIdFromSId(
    connectionParams.mcpServerId
  );

  let toolsStakes: Record<string, MCPToolStakeLevelType> = {};

  switch (serverType) {
    case "internal": {
      const r = getInternalMCPServerNameAndWorkspaceId(
        connectionParams.mcpServerId
      );
      if (r.isErr()) {
        return r;
      }
      const serverName = r.value.name;
      toolsStakes = INTERNAL_MCP_SERVERS[serverName]?.tools_stakes || {};
      break;
    }

    case "remote": {
      const metadata =
        await RemoteMCPServerToolMetadataResource.fetchByServerId(auth, id);
      toolsStakes = metadata.reduce<Record<string, MCPToolStakeLevelType>>(
        (acc, metadata) => {
          acc[metadata.toolName] = metadata.permission;
          return acc;
        },
        {}
      );
      break;
    }
    default:
      assertNever(serverType);
  }

  const toolsWithStakes = allToolsRaw.map((tool) => ({
    ...tool,
    stakeLevel:
      toolsStakes[tool.name] ||
      (availability === "manual"
        ? FALLBACK_MCP_TOOL_STAKE_LEVEL
        : FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL),
    availability,
    toolServerId: connectionParams.mcpServerId,
  }));

  const platformToolConfigs = makePlatformMCPToolConfigurations(
    config,
    toolsWithStakes
  );
  return new Ok(platformToolConfigs);
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
): Promise<Result<MCPToolConfigurationType[], Error>> {
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

    let toolsRes: Result<MCPToolConfigurationType[], Error>;
    if (isConnectViaLocalMCPServer(connectionParams)) {
      assert(
        !isPlatformMCPServerConfiguration(config),
        "Config should not be a platform configuration when connecting via Local MCP Server."
      );
      toolsRes = await listToolsForLocalMCPServer(mcpClient, config);
    } else {
      assert(
        isPlatformMCPServerConfiguration(config),
        "Config should be a platform configuration when connecting via Platform MCP Server."
      );
      toolsRes = await listToolsForPlatformMCPServer(
        auth,
        connectionParams,
        mcpClient,
        config
      );
    }

    if (toolsRes.isErr()) {
      return toolsRes;
    }

    const tools = toolsRes.value;

    logger.debug(
      {
        workspaceId: owner.id,
        conversationId,
        messageId,
        toolCount: tools.length,
      },
      `Retrieved ${tools.length} tools from MCP server`
    );

    return new Ok(tools);
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
