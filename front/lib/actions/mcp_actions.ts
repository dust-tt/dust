// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  CallToolResult,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolResultSchema,
  ProgressNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import EventEmitter from "events";
import type { JSONSchema7 } from "json-schema";

import {
  calculateContentSize,
  getMaxSize,
  isValidContentSize,
} from "@app/lib/actions/action_output_limits";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  DEFAULT_CLIENT_SIDE_MCP_TOOL_STAKE_LEVEL,
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL,
  FALLBACK_MCP_TOOL_STAKE_LEVEL,
} from "@app/lib/actions/constants";
import type {
  ClientSideMCPServerConfigurationType,
  ClientSideMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
  ServerSideMCPToolConfigurationType,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  getAvailabilityOfInternalMCPServerById,
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { findMatchingSubSchemas } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isMCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import type {
  MCPConnectionParams,
  ServerSideMCPConnectionParams,
} from "@app/lib/actions/mcp_metadata";
import {
  connectToMCPServer,
  extractMetadataFromTools,
  isConnectViaClientSideMCPServer,
  isConnectViaMCPServerId,
} from "@app/lib/actions/mcp_metadata";
import type {
  AgentLoopListToolsContextType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import {
  isClientSideMCPToolConfiguration,
  isMCPServerConfiguration,
  isMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { getBaseServerId } from "@app/lib/api/actions/mcp/client_side_registry";
import type {
  ClientSideMCPToolTypeWithStakeLevel,
  MCPToolRetryPolicyType,
  MCPToolType,
  ServerSideMCPToolTypeWithStakeAndRetryPolicy,
} from "@app/lib/api/mcp";
import { DEFAULT_MCP_TOOL_RETRY_POLICY } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { fromEvent } from "@app/lib/utils/events";
import logger from "@app/logger/logger";
import type { ModelId, Result } from "@app/types";
import { Err, normalizeError, Ok, slugify } from "@app/types";

const MAX_OUTPUT_ITEMS = 128;

const MCP_NOTIFICATION_EVENT_NAME = "mcp-notification";
const MCP_TOOL_DONE_EVENT_NAME = "TOOL_DONE" as const;

const EMPTY_INPUT_SCHEMA: JSONSchema7 = {
  properties: {},
  required: [],
  type: "object",
};

function isEmptyInputSchema(schema: JSONSchema7): boolean {
  // By default, empty tools yields an empty input schema.
  const isContentConsideredEmpty =
    schema.properties === undefined &&
    schema.required === undefined &&
    schema.type === "object";

  return isContentConsideredEmpty;
}

const MAX_TOOL_NAME_LENGTH = 64;

export const TOOL_NAME_SEPARATOR = "__";

// Define the new type here for now, or move to a dedicated types file later.
export interface ServerToolsAndInstructions {
  serverName: string;
  instructions?: string;
  tools: MCPToolConfigurationType[];
}

export function getToolExtraFields(
  mcpServerId: string,
  metadata: {
    toolName: string;
    permission: "high" | "low" | "never_ask";
    enabled: boolean;
  }[]
) {
  let toolsStakes: Record<string, MCPToolStakeLevelType> = {};
  let serverTimeoutMs: number | undefined;
  let toolsRetryPolicies: Record<string, MCPToolRetryPolicyType> | undefined;

  const { serverType } = getServerTypeAndIdFromSId(mcpServerId);
  if (serverType === "internal") {
    const r = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
    if (r.isErr()) {
      return r;
    }
    const serverName = r.value.name;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    toolsStakes = INTERNAL_MCP_SERVERS[serverName].tools_stakes || {};
    toolsRetryPolicies = INTERNAL_MCP_SERVERS[serverName].tools_retry_policies;
    serverTimeoutMs = INTERNAL_MCP_SERVERS[serverName]?.timeoutMs;
  } else {
    metadata.forEach(
      ({ toolName, permission }) => (toolsStakes[toolName] = permission)
    );
  }

  // Filter out tools that are not enabled.
  const toolsEnabled = metadata.reduce<Record<string, boolean>>(
    (acc, metadata) => {
      acc[metadata.toolName] = metadata.enabled;
      return acc;
    },
    {}
  );

  return new Ok({
    toolsEnabled,
    toolsStakes,
    toolsRetryPolicies,
    serverTimeoutMs,
  });
}

function makeServerSideMCPToolConfigurations(
  config: ServerSideMCPServerConfigurationType,
  tools: ServerSideMCPToolTypeWithStakeAndRetryPolicy[]
): ServerSideMCPToolConfigurationType[] {
  return tools.map((tool) => ({
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    name: tool.name,
    icon: config.icon,
    description: tool.description ?? null,
    inputSchema:
      !tool.inputSchema || isEmptyInputSchema(tool.inputSchema)
        ? EMPTY_INPUT_SCHEMA
        : tool.inputSchema,
    id: config.id,
    retryPolicy: tool.retryPolicy,
    mcpServerViewId: config.mcpServerViewId,
    internalMCPServerId: config.internalMCPServerId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    dataSources: config.dataSources || [], // Ensure dataSources is always an array
    tables: config.tables,
    availability: tool.availability,
    childAgentId: config.childAgentId,
    reasoningModel: config.reasoningModel,
    timeFrame: config.timeFrame,
    jsonSchema: config.jsonSchema,
    additionalConfiguration: config.additionalConfiguration,
    permission: tool.stakeLevel,
    toolServerId: tool.toolServerId,
    originalName: tool.name,
    mcpServerName: config.name,
    dustAppConfiguration: config.dustAppConfiguration,
    secretName: config.secretName,
    ...(tool.timeoutMs && { timeoutMs: tool.timeoutMs }),
  }));
}

function makeClientSideMCPToolConfigurations(
  config: ClientSideMCPServerConfigurationType,
  tools: ClientSideMCPToolTypeWithStakeLevel[]
): ClientSideMCPToolConfigurationType[] {
  return tools.map((tool) => ({
    sId: generateRandomModelSId(),
    type: "mcp_configuration",
    availability: "manual", // Can't be auto for client-side MCP servers.
    clientSideMcpServerId: config.clientSideMcpServerId,
    description: tool.description ?? null,
    id: config.id,
    inputSchema:
      !tool.inputSchema || isEmptyInputSchema(tool.inputSchema)
        ? EMPTY_INPUT_SCHEMA
        : tool.inputSchema,
    mcpServerName: config.name,
    name: tool.name,
    originalName: tool.name,
    permission: tool.stakeLevel,
    // Use the base serverId (without suffix) to ensure tools are shared across all instances
    // of the same server name, allowing for consistent tool behavior.
    toolServerId: getBaseServerId(config.clientSideMcpServerId),
    icon: config.icon,
  }));
}

function generateContentMetadata(content: CallToolResult["content"]): {
  type: "text" | "image" | "resource" | "audio" | "resource_link";
  byteSize: number;
  maxSize: number;
}[] {
  const result = [];
  for (const item of content) {
    const byteSize = calculateContentSize(item);
    const maxSize = getMaxSize(item);

    result.push({ type: item.type, byteSize, maxSize });

    if (byteSize > maxSize) {
      break;
    }
  }
  return result;
}

/**
 * Try to call an MCP tool.
 *
 * May fail when connecting to remote/client-side servers.
 * In case of an error, the error content is bubbled up to expose it to the model.
 */
export async function* tryCallMCPTool(
  auth: Authenticator,
  inputs: Record<string, unknown> | undefined,
  agentLoopRunContext: AgentLoopRunContextType,
  {
    progressToken,
    makeToolNotificationEvent,
    signal,
  }: {
    progressToken: ModelId;
    makeToolNotificationEvent: (
      notification: MCPProgressNotificationType
    ) => Promise<ToolNotificationEvent>;
    signal?: AbortSignal;
  }
): AsyncGenerator<
  ToolNotificationEvent,
  Result<CallToolResult["content"], Error | McpError>
> {
  const { toolConfiguration } = agentLoopRunContext;

  if (!isMCPToolConfiguration(toolConfiguration)) {
    return new Err(
      new Error("Invalid action configuration: not an MCP action configuration")
    );
  }

  const conversationId = agentLoopRunContext.conversation.sId;
  const messageId = agentLoopRunContext.agentMessage.sId;

  const connectionParamsRes = await getMCPClientConnectionParams(
    auth,
    toolConfiguration,
    {
      conversationId,
      messageId,
    }
  );
  if (connectionParamsRes.isErr()) {
    return connectionParamsRes;
  }

  let mcpClient;
  try {
    const connectionResult = await connectToMCPServer(auth, {
      params: connectionParamsRes.value,
      agentLoopContext: { runContext: agentLoopRunContext },
    });
    if (connectionResult.isErr()) {
      if (
        connectionResult.error instanceof
        MCPServerPersonalAuthenticationRequiredError
      ) {
        return new Ok(
          makePersonalAuthenticationError(
            connectionResult.error.provider,
            connectionResult.error.scope
          ).content
        );
      }

      return connectionResult;
    }
    mcpClient = connectionResult.value;

    const emitter = new EventEmitter();

    // Convert the emitter to an async generator.
    const notificationStream = fromEvent<MCPProgressNotificationType>(
      emitter,
      MCP_NOTIFICATION_EVENT_NAME
    );

    const abortSignal = signal;
    const ABORTED = Symbol("mcp-tool-aborted");
    let abortPromise: Promise<typeof ABORTED> | null = null;
    if (abortSignal) {
      if (abortSignal.aborted) {
        abortPromise = Promise.resolve(ABORTED);
      } else {
        abortPromise = new Promise((resolve) => {
          abortSignal.addEventListener(
            "abort",
            () => resolve(ABORTED),
            { once: true }
          );
        });
      }
    }

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
        name: toolConfiguration.originalName,
        arguments: inputs,
        _meta: {
          progressToken,
        },
      },
      CallToolResultSchema,
      {
        timeout: toolConfiguration.timeoutMs ?? DEFAULT_MCP_REQUEST_TIMEOUT_MS,
        signal: abortSignal,
      }
    );

    // Read from notificationStream and yield events until the tool is done.
    let toolDone = false;
    let wasAborted = abortSignal?.aborted ?? false;
    while (!toolDone) {
      const raceInputs: Array<
        Promise<IteratorResult<MCPProgressNotificationType>> |
        Promise<typeof MCP_TOOL_DONE_EVENT_NAME> |
        Promise<typeof ABORTED>
      > = [
        notificationStream.next(), // Next notification.
        toolPromise.then(() => MCP_TOOL_DONE_EVENT_NAME), // Or tool fully completes.
      ];
      if (abortPromise) {
        raceInputs.push(abortPromise);
      }

      const notificationOrDone = await Promise.race(raceInputs);

      if (notificationOrDone === ABORTED) {
        wasAborted = true;
        break;
      }

      // If the tool completed, break from the loop and stop reading notifications.
      if (notificationOrDone === MCP_TOOL_DONE_EVENT_NAME) {
        toolDone = true;
      } else {
        const iteratorResult = notificationOrDone;
        if (iteratorResult.done) {
          // The notifications ended prematurely.
          break;
        }

        yield makeToolNotificationEvent(iteratorResult.value);
      }
    }

    // Tool is done now, wait for the actual result.
    try {
      const toolCallResult = await toolPromise;

      if (wasAborted) {
        return new Err(
          new MCPError("Tool execution cancelled", {
            tracked: false,
          })
        );
      }

      // We do not check toolCallResult.isError here and raise an error if true as this would break
      // the conversation.
      // Instead, we let the model decide what to do based on the content exposed.

      // Type inference is not working here because of them using passthrough in the zod schema.
      const content: CallToolResult["content"] = (toolCallResult.content ??
        []) as CallToolResult["content"];

      if (content.length >= MAX_OUTPUT_ITEMS) {
        return new Err(
          new Error(
            `Too many output items: ${content.length} (max is ${MAX_OUTPUT_ITEMS})`
          )
        );
      }

      let serverType;
      if (isClientSideMCPToolConfiguration(toolConfiguration)) {
        serverType = "client";
      } else if (isServerSideMCPToolConfiguration(toolConfiguration)) {
        serverType = "internal";
      } else {
        serverType = "remote";
      }

      if (serverType === "remote") {
        const isValid = isValidContentSize(content);

        if (!isValid) {
          const contentMetadata = generateContentMetadata(content);
          logger.info(
            { contentMetadata, isValid },
            "information on MCP tool result"
          );

          return new Err(new Error("MCP tool result content size too large."));
        }
      }

      return new Ok(content);
    } catch (error) {
      if (abortSignal?.aborted) {
        return new Err(
          new MCPError("Tool execution cancelled", {
            tracked: false,
            cause: error instanceof Error ? error : undefined,
          })
        );
      }

      logger.error(
        {
          conversationId,
          error,
          messageId,
          toolName: toolConfiguration.originalName,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Exception calling MCP tool in tryCallMCPTool()"
      );

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
    (isMCPServerConfiguration(config) &&
      isServerSideMCPServerConfiguration(config)) ||
    (isMCPToolConfiguration(config) && isServerSideMCPToolConfiguration(config))
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
      oAuthUseCase: mcpServerView.oAuthUseCase,
    });
  }

  return new Ok({
    type: "clientSideMCPServerId",
    mcpServerId: config.clientSideMcpServerId,
    conversationId,
    messageId,
  });
}

export function getPrefixedToolName(
  config: MCPServerConfigurationType,
  originalName: string
): Result<string, Error> {
  const slugifiedConfigName = slugify(config.name);
  const slugifiedOriginalName = slugify(originalName).replaceAll(
    // Remove anything that is not a-zA-Z0-9_.- because it's not supported by the LLMs.
    /[^a-zA-Z0-9_.-]/g,
    ""
  );

  const separator = TOOL_NAME_SEPARATOR;

  // If the original name is already too long, we can't use it.
  if (slugifiedOriginalName.length > MAX_TOOL_NAME_LENGTH) {
    return new Err(
      new Error(
        `Tool name "${originalName}" is too long. Maximum length is ${MAX_TOOL_NAME_LENGTH} characters.`
      )
    );
  }

  // Calculate if we have enough room for a meaningful prefix (3 chars) plus separator
  const minPrefixLength = 3 + separator.length;
  const availableSpace = MAX_TOOL_NAME_LENGTH - slugifiedOriginalName.length;

  // If we don't have enough room for a meaningful prefix, just return the original name
  if (availableSpace < minPrefixLength) {
    return new Ok(slugifiedOriginalName);
  }

  // Calculate the maximum allowed length for the config name portion
  const maxConfigNameLength = availableSpace - separator.length;
  const truncatedConfigName = slugifiedConfigName.slice(0, maxConfigNameLength);
  const prefixedName = `${truncatedConfigName}${separator}${slugifiedOriginalName}`;

  return new Ok(prefixedName);
}

type AgentLoopListToolsContextWithoutConfigurationType = Omit<
  AgentLoopListToolsContextType,
  "agentActionConfiguration"
>;

/**
 * List the MCP tools for the given agent actions.
 * Returns MCP tools by connecting to the specified MCP servers.
 */
export async function tryListMCPTools(
  auth: Authenticator,
  agentLoopListToolsContext: AgentLoopListToolsContextWithoutConfigurationType,
  jitServers?: MCPServerConfigurationType[]
): Promise<{
  serverToolsAndInstructions: ServerToolsAndInstructions[];
  error?: string;
}> {
  const owner = auth.getNonNullableWorkspace();

  // Filter for MCP server configurations.
  const mcpServerActions = [
    ...agentLoopListToolsContext.agentConfiguration.actions,
    ...(agentLoopListToolsContext.clientSideActionConfigurations ?? []),
    ...(jitServers ?? []),
  ];

  // Discover all tools exposed by all available MCP servers.
  const results = await concurrentExecutor(
    mcpServerActions,
    async (action) => {
      const toolsAndInstructionsRes =
        await listMCPServerToolsAndServerInstructions(auth, action, {
          ...agentLoopListToolsContext,
          agentActionConfiguration: action,
        });

      if (toolsAndInstructionsRes.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            conversationId: agentLoopListToolsContext.conversation.sId,
            messageId: agentLoopListToolsContext.agentMessage.sId,
            actionId: action.sId,
            mcpServerName: action.name,
            error: toolsAndInstructionsRes.error,
          },
          `Error listing tools from MCP server: ${normalizeError(
            toolsAndInstructionsRes.error
          )}`
        );
        return new Err(
          new Error(
            `An error occurred while listing the available tools for ${action.name}. ` +
              "Tools from this server are not available for this message. " +
              "Inform the user of this issue."
          )
        );
      }

      const { instructions, tools: rawToolsFromServer } =
        toolsAndInstructionsRes.value;

      const processedTools: MCPToolConfigurationType[] = [];

      for (const toolConfig of rawToolsFromServer) {
        // Fix the tool name to be valid for the model.
        const toolName = getPrefixedToolName(action, toolConfig.name);
        if (toolName.isErr()) {
          logger.warn(
            {
              workspaceId: owner.sId,
              conversationId: agentLoopListToolsContext.conversation.sId,
              messageId: agentLoopListToolsContext.agentMessage.sId,
              actionId: action.sId,
              mcpServerName: action.name,
              toolName: toolConfig.name,
              error: toolName.error,
            },
            `Invalid tool name, skipping the tool.`
          );
          continue;
        }

        // Check that all tools arguments names are valid for the model (a-zA-Z0-9_.-).
        const toolArgumentsNames = Object.keys(
          toolConfig.inputSchema?.properties ?? {}
        );

        const invalidArgumentNames = toolArgumentsNames.filter(
          (argumentName) => !/^[a-zA-Z0-9_.-]+$/.test(argumentName)
        );
        if (invalidArgumentNames.length > 0) {
          logger.warn(
            {
              workspaceId: owner.sId,
              conversationId: agentLoopListToolsContext.conversation.sId,
              messageId: agentLoopListToolsContext.agentMessage.sId,
              actionId: action.sId,
              mcpServerName: action.name,
              toolName: toolConfig.name,
              invalidArgumentNames,
            },
            `Invalid argument name(s), skipping the tool.`
          );
          continue;
        }

        // This handles the case where the MCP server configuration is using pre-configured data sources
        // or tables.
        // We add the description of the data sources or tables to the tool description so that the model
        // has more information to make the right choice.
        // This replicates the current behavior of the Retrieval action for example.
        let extraDescription: string = "";
        if (action.description) {
          const hasDataSourceConfiguration =
            Object.keys(
              findMatchingSubSchemas(
                toolConfig.inputSchema,
                INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE
              )
            ).length > 0;

          const hasTableConfiguration =
            Object.keys(
              findMatchingSubSchemas(
                toolConfig.inputSchema,
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

        processedTools.push({
          ...toolConfig,
          originalName: toolConfig.name,
          mcpServerName: action.name,
          name: toolName.value,
          description: (toolConfig.description ?? "") + extraDescription,
        });
      }

      // Return the server's instructions and its processed tools.
      return new Ok<ServerToolsAndInstructions>({
        serverName: action.name,
        instructions,
        tools: processedTools,
      });
    },
    { concurrency: 10 }
  );

  // Aggregate results
  const { serverToolsAndInstructions, errors } = results.reduce<{
    serverToolsAndInstructions: ServerToolsAndInstructions[];
    errors: string[];
  }>(
    (acc, result) => {
      if (result.isOk()) {
        acc.serverToolsAndInstructions.push(result.value);
      } else {
        acc.errors.push(result.error.message);
      }
      return acc;
    },
    { serverToolsAndInstructions: [], errors: [] }
  );

  return {
    serverToolsAndInstructions,
    error: errors.length > 0 ? errors.join("\n") : undefined,
  };
}

async function listToolsForClientSideMCPServer(
  mcpClient: Client,
  config: ClientSideMCPServerConfigurationType
): Promise<Result<MCPToolConfigurationType[], Error>> {
  let allTools: ClientSideMCPToolTypeWithStakeLevel[] = [];
  let nextPageCursor;

  // Fetch all tools, handling pagination if supported by the MCP server.
  do {
    const { tools, nextCursor } = await mcpClient.listTools();

    nextPageCursor = nextCursor;
    allTools = [
      ...allTools,
      ...extractMetadataFromTools(tools).map((tool) => ({
        ...tool,
        availability: "manual" as const,
        stakeLevel: DEFAULT_CLIENT_SIDE_MCP_TOOL_STAKE_LEVEL,
      })),
    ];
  } while (nextPageCursor);

  // Create the configurations directly here.
  const clientSideToolConfigs = makeClientSideMCPToolConfigurations(
    config,
    allTools
  );

  return new Ok(clientSideToolConfigs);
}

export async function listToolsForServerSideMCPServer(
  auth: Authenticator,
  connectionParams: ServerSideMCPConnectionParams,
  mcpClient: Client,
  config: ServerSideMCPServerConfigurationType
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
      retryPolicy: DEFAULT_MCP_TOOL_RETRY_POLICY,
    }));

    // Create configurations and add required properties.
    const serverSideToolConfigs = makeServerSideMCPToolConfigurations(
      config,
      rawTools
    );
    return new Ok(serverSideToolConfigs);
  }

  const metadata = await RemoteMCPServerToolMetadataResource.fetchByServerId(
    auth,
    connectionParams.mcpServerId
  );

  const r = getToolExtraFields(connectionParams.mcpServerId, metadata);
  if (r.isErr()) {
    return r;
  }
  const { toolsEnabled, toolsStakes, serverTimeoutMs, toolsRetryPolicies } =
    r.value;

  const availability = getAvailabilityOfInternalMCPServerById(
    connectionParams.mcpServerId
  );

  const toolsWithStakesRetryPoliciesAndTimeout = allToolsRaw
    .filter(({ name }) => !(toolsEnabled[name] === false)) // Include tools that are enabled (true) or not explicitly disabled (undefined).
    .map((tool) => ({
      ...tool,
      stakeLevel:
        toolsStakes[tool.name] ||
        (availability === "manual"
          ? FALLBACK_MCP_TOOL_STAKE_LEVEL
          : FALLBACK_INTERNAL_AUTO_SERVERS_TOOL_STAKE_LEVEL),
      availability,
      toolServerId: connectionParams.mcpServerId,
      ...(serverTimeoutMs && { timeoutMs: serverTimeoutMs }),
      retryPolicy:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        toolsRetryPolicies?.[tool.name] ||
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        toolsRetryPolicies?.["default"] ||
        DEFAULT_MCP_TOOL_RETRY_POLICY,
    }));

  const serverSideToolConfigs = makeServerSideMCPToolConfigurations(
    config,
    toolsWithStakesRetryPoliciesAndTimeout
  );
  return new Ok(serverSideToolConfigs);
}

async function listMCPServerToolsAndServerInstructions(
  auth: Authenticator,
  config: MCPServerConfigurationType,
  agentLoopListToolsContext: AgentLoopListToolsContextType
): Promise<
  Result<{ instructions?: string; tools: MCPToolConfigurationType[] }, Error>
> {
  const owner = auth.getNonNullableWorkspace();
  let mcpClient;

  const connectionParamsRes = await getMCPClientConnectionParams(auth, config, {
    conversationId: agentLoopListToolsContext.conversation.sId,
    messageId: agentLoopListToolsContext.agentMessage.sId,
  });

  if (connectionParamsRes.isErr()) {
    return connectionParamsRes;
  }

  try {
    // Connect to the MCP server.
    const connectionParams = connectionParamsRes.value;
    const r = await connectToMCPServer(auth, {
      params: connectionParams,
      agentLoopContext: { listToolsContext: agentLoopListToolsContext },
    });
    if (r.isErr()) {
      return r;
    }
    mcpClient = r.value;

    const serverInstructions = mcpClient.getInstructions();

    let toolsRes: Result<MCPToolConfigurationType[], Error>;
    if (isConnectViaClientSideMCPServer(connectionParams)) {
      assert(
        !isServerSideMCPServerConfiguration(config),
        "Config should not be a server-side configuration when connecting via client-side MCP Server."
      );
      toolsRes = await listToolsForClientSideMCPServer(mcpClient, config);
    } else {
      assert(
        isServerSideMCPServerConfiguration(config),
        "Config should be a server-side configuration when connecting via server-side MCP Server."
      );
      toolsRes = await listToolsForServerSideMCPServer(
        auth,
        connectionParams,
        mcpClient,
        config
      );
    }

    if (toolsRes.isErr()) {
      return toolsRes;
    }

    const { value: toolsFromServer } = toolsRes;

    logger.debug(
      {
        workspaceId: owner.sId,
        conversationId: agentLoopListToolsContext.conversation.sId,
        messageId: agentLoopListToolsContext.agentMessage.sId,
        toolCount: toolsFromServer.length,
      },
      `Retrieved ${toolsFromServer.length} tools from MCP server`
    );

    // Return server instructions and the tools from this server.
    return new Ok({ instructions: serverInstructions, tools: toolsFromServer });
  } catch (error) {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId: agentLoopListToolsContext.conversation.sId,
        messageId: agentLoopListToolsContext.agentMessage.sId,
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
            workspaceId: owner.sId,
            conversationId: agentLoopListToolsContext.conversation.sId,
            messageId: agentLoopListToolsContext.agentMessage.sId,
            error: closeError,
          },
          "Error closing MCP client connection"
        );
      }
    }
  }
}
