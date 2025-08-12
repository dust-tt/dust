import type { ActionApprovalStateType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { omit } from "lodash";

import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import {
  executeMCPTool,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type {
  CustomServerIconType,
  InternalAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  hideFileFromActionOutput,
  rewriteContentForModel,
} from "@app/lib/actions/mcp_utils";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  DustAppRunConfigurationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  LightWorkspaceType,
  ModelConfigurationType,
  ModelId,
  ReasoningModelConfigurationType,
  TimeFrame,
} from "@app/types";
import { assertNever, removeNulls } from "@app/types";

export type BaseMCPServerConfigurationType = {
  id: ModelId;

  sId: string;

  type: "mcp_server_configuration";

  name: string;

  description: string | null;
  icon?: CustomServerIconType | InternalAllowedIconType;
};

// Server-side MCP server = Remote MCP Server OR our own MCP server.
export type ServerSideMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    dataSources: DataSourceConfiguration[] | null;
    tables: TableDataSourceConfiguration[] | null;
    childAgentId: string | null;
    reasoningModel: ReasoningModelConfigurationType | null;
    timeFrame: TimeFrame | null;
    jsonSchema: JSONSchema | null;
    additionalConfiguration: Record<string, boolean | number | string>;
    mcpServerViewId: string;
    dustAppConfiguration: DustAppRunConfigurationType | null;
    // Out of convenience, we hold the sId of the internal server if it is an internal server.
    internalMCPServerId: string | null;
  };

export type ClientSideMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    clientSideMcpServerId: string;
  };

export type MCPServerConfigurationType =
  | ServerSideMCPServerConfigurationType
  | ClientSideMCPServerConfigurationType;

export type ServerSideMCPToolType = Omit<
  ServerSideMCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
  availability: MCPServerAvailability;
  permission: MCPToolStakeLevelType;
  toolServerId: string;
  timeoutMs?: number;
};

export type ClientSideMCPToolType = Omit<
  ClientSideMCPServerConfigurationType,
  "type"
> & {
  inputSchema: JSONSchema;
  permission: MCPToolStakeLevelType;
  toolServerId: string;
  type: "mcp_configuration";
  timeoutMs?: number;
};

type WithToolNameMetadata<T> = T & {
  originalName: string;
  mcpServerName: string;
};

export type ServerSideMCPToolConfigurationType =
  WithToolNameMetadata<ServerSideMCPToolType>;

export type ClientSideMCPToolConfigurationType =
  WithToolNameMetadata<ClientSideMCPToolType>;

export type MCPToolConfigurationType =
  | ServerSideMCPToolConfigurationType
  | ClientSideMCPToolConfigurationType;

const MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT = [
  "description",
  "inputSchema",
] as const;

type LightMCPToolType<T> = Omit<
  T,
  (typeof MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT)[number]
>;

export type LightServerSideMCPToolConfigurationType =
  LightMCPToolType<ServerSideMCPToolConfigurationType>;

export type LightClientSideMCPToolConfigurationType =
  LightMCPToolType<ClientSideMCPToolConfigurationType>;

export type LightMCPToolConfigurationType =
  | LightServerSideMCPToolConfigurationType
  | LightClientSideMCPToolConfigurationType;

export type MCPApproveExecutionEvent = {
  type: "tool_approve_execution";
  // Temporary code to be backwards compatible with the old actionId format.
  // TODO(MCP 2025-06-09): Remove this once all extensions are updated.
  action: MCPActionType;
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  actionId: string;
  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;
  metadata: MCPValidationMetadataType;
};

export function getMCPApprovalStateFromUserApprovalState(
  userApprovalState: ActionApprovalStateType
): MCPExecutionState {
  switch (userApprovalState) {
    case "always_approved":
    case "approved":
      return "allowed_explicitly";

    case "rejected":
      return "denied";

    default:
      assertNever(userApprovalState);
  }
}

export type MCPExecutionState =
  | "allowed_explicitly"
  | "allowed_implicitly"
  | "denied"
  | "pending"
  | "timeout";

type MCPParamsEvent = {
  type: "tool_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

type MCPSuccessEvent = {
  type: "tool_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

type MCPErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type ToolNotificationEvent = {
  type: "tool_notification";
  created: number;
  configurationId: string;
  conversationId: string;
  messageId: string;
  action: MCPActionType;
  notification: ProgressNotificationContentType;
};

export type ActionBaseParams = Omit<
  MCPActionBlob,
  "id" | "type" | "executionState" | "output" | "isError"
>;

export type AgentActionRunningEvents =
  | MCPParamsEvent
  | MCPApproveExecutionEvent
  | ToolNotificationEvent;

type RemoveFunctionFields<T> = Pick<
  T,
  {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [K in keyof T]: T[K] extends Function ? never : K;
  }[keyof T]
>;

type MCPActionBlob = RemoveFunctionFields<MCPActionType>;

// This action uses the MCP protocol to communicate
export class MCPActionType {
  readonly id: ModelId;
  readonly generatedFiles: ActionGeneratedFileType[];
  readonly agentMessageId: ModelId;
  readonly executionState: MCPExecutionState = "pending";

  readonly mcpServerConfigurationId: string;
  readonly mcpServerId: string | null;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly output: CallToolResult["content"] | null;
  // TODO(durable-agents): drop this column.
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly isError: boolean = false;
  readonly citationsAllocated: number = 0;
  // TODO(2025-07-24 aubin): remove the type here.
  readonly type = "tool_action" as const;

  constructor(blob: MCPActionBlob) {
    this.id = blob.id;
    this.type = blob.type;
    this.generatedFiles = blob.generatedFiles;

    this.agentMessageId = blob.agentMessageId;
    this.mcpServerConfigurationId = blob.mcpServerConfigurationId;
    this.mcpServerId = blob.mcpServerId;
    this.executionState = blob.executionState;
    this.isError = blob.isError;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
    this.citationsAllocated = blob.citationsAllocated;
  }

  getGeneratedFiles(): ActionGeneratedFileType[] {
    return this.generatedFiles;
  }

  renderForFunctionCall(): FunctionCallType {
    if (!this.functionCallId) {
      throw new Error("MCPAction: functionCallId is required");
    }
    if (!this.functionCallName) {
      throw new Error("MCPAction: functionCallName is required");
    }

    return {
      id: this.functionCallId,
      name: this.functionCallName,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(
    _: Authenticator,
    {
      model,
    }: {
      model: ModelConfigurationType;
    }
  ): Promise<FunctionMessageTypeModel> {
    if (!this.functionCallName) {
      throw new Error("MCPAction: functionCallName is required");
    }

    if (!this.functionCallId) {
      throw new Error("MCPAction: functionCallId is required");
    }

    const totalTextLength =
      this.output?.reduce(
        (acc, curr) =>
          acc + (curr.type === "text" ? curr.text?.length ?? 0 : 0),
        0
      ) ?? 0;

    if (totalTextLength > model.contextSize * 0.9) {
      return {
        role: "function" as const,
        name: this.functionCallName,
        function_call_id: this.functionCallId,
        content:
          "The tool returned too much content. The response cannot be processed.",
      };
    }

    const outputItems = removeNulls(
      this.output?.map(rewriteContentForModel) ?? []
    );

    const output = (() => {
      if (outputItems.length === 0) {
        return "Successfully executed action, no output.";
      }

      if (outputItems.every((item) => isTextContent(item))) {
        return outputItems.map((item) => item.text).join("\n");
      }

      return JSON.stringify(outputItems);
    })();

    return {
      role: "function" as const,
      name: this.functionCallName,
      function_call_id: this.functionCallId,
      content: output,
    };
  }

  getSId(owner: LightWorkspaceType): string {
    return MCPActionType.modelIdToSId({
      id: this.id,
      workspaceId: owner.id,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("mcp_action", {
      id,
      workspaceId,
    });
  }
}

const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Builds a tool specification for the given MCP action configuration.
 */
export function buildToolSpecification(
  actionConfiguration: MCPToolConfigurationType
): AgentActionSpecification {
  // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT
  const filteredInputSchema = hideInternalConfiguration(
    actionConfiguration.inputSchema
  );

  return {
    name: actionConfiguration.name,
    description:
      actionConfiguration.description?.slice(0, MAX_DESCRIPTION_LENGTH) ?? "",
    inputSchema: filteredInputSchema,
  };
}

/**
 * Runs a tool with streaming for the given MCP action configuration.
 *
 * All errors within this function must be handled through `handleMCPActionError`
 * to ensure consistent error reporting and proper conversation flow control.
 * TODO(DURABLE_AGENTS 2025-08-05): This function is going to be used only to execute the tool.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  {
    action,
    actionBaseParams,
    agentConfiguration,
    agentMessage,
    conversation,
    mcpAction,
    stepContext,
  }: {
    action: AgentMCPAction;
    actionBaseParams: ActionBaseParams;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
    mcpAction: MCPActionType;
    stepContext: StepContext;
  }
): AsyncGenerator<
  | MCPParamsEvent
  | MCPSuccessEvent
  | MCPErrorEvent
  | MCPApproveExecutionEvent
  | ToolNotificationEvent,
  void
> {
  const owner = auth.getNonNullableWorkspace();

  const { toolConfiguration } = action;

  const localLogger = logger.child({
    actionConfigurationId: toolConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    workspaceId: conversation.owner.sId,
  });

  const tags = [
    `action:${toolConfiguration.name}`,
    `mcp_server:${toolConfiguration.mcpServerName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
  ];

  const { executionState } = mcpAction;

  if (executionState === "denied") {
    statsDClient.increment("mcp_actions_denied.count", 1, tags);
    localLogger.info("Action execution rejected by user");

    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      executionState,
      errorMessage:
        "The user rejected this specific action execution. Using this action is hence forbidden for this message.",
      yieldAsError: false,
    });
    return;
  }

  // Use the augmented inputs that were computed and stored during action creation
  const inputs = action.augmentedInputs;

  const agentLoopRunContext: AgentLoopRunContextType = {
    agentConfiguration,
    agentMessage,
    conversation,
    stepContext,
    toolConfiguration,
  };

  const toolCallResult = yield* executeMCPTool({
    auth,
    inputs,
    agentLoopRunContext,
    action,
    agentConfiguration,
    conversation,
    agentMessage,
    mcpAction,
  });

  if (!toolCallResult || toolCallResult.isErr()) {
    statsDClient.increment("mcp_actions_error.count", 1, tags);
    localLogger.error(
      {
        error: toolCallResult
          ? toolCallResult.error.message
          : "No tool call result",
      },
      "Error calling MCP tool on run."
    );

    // If we got a personal authentication error, we emit a `tool_error` which will get turned
    // into an `agent_error` with metadata set such that we can display an invitation to connect
    // to the user.
    if (
      MCPServerPersonalAuthenticationRequiredError.is(toolCallResult?.error)
    ) {
      const authErrorMessage =
        `The tool ${actionBaseParams.functionCallName} requires personal ` +
        `authentication, please authenticate to use it.`;

      yield await handleMCPActionError({
        action,
        actionBaseParams,
        agentConfiguration,
        agentMessage,
        executionState,
        errorMessage: authErrorMessage,
        yieldAsError: true,
        errorCode: "mcp_server_personal_authentication_required",
        errorMetadata: {
          mcp_server_id: toolCallResult.error.mcpServerId,
          provider: toolCallResult.error.provider,
          ...(toolCallResult.error.scope && {
            scope: toolCallResult.error.scope,
          }),
        },
      });

      return;
    }

    const { error: toolErr } = toolCallResult ?? {};
    let errorMessage: string;

    // We don't want to expose the MCP full error message to the user.
    if (toolErr && toolErr instanceof McpError && toolErr.code === -32001) {
      // MCP Error -32001: Request timed out.
      errorMessage = `The tool ${actionBaseParams.functionCallName} timed out. `;
    } else {
      errorMessage = `The tool ${actionBaseParams.functionCallName} returned an error. `;
    }
    errorMessage +=
      "An error occurred while executing the tool. You can inform the user of this issue.";

    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      executionState,
      errorMessage,
      yieldAsError: false,
    });
    return;
  }

  const { outputItems, generatedFiles } = await processToolResults(auth, {
    action,
    conversation,
    localLogger,
    toolCallResult: toolCallResult.value,
    toolConfiguration,
  });

  statsDClient.increment("mcp_actions_success.count", 1, tags);

  yield {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles,
      executionState,
      id: action.id,
      isError: false,
      output: removeNulls(outputItems.map(hideFileFromActionOutput)),
      type: "tool_action",
    }),
  };
}

/**
 * Creates MCP action in database and returns both the DB record and the type object.
 */
export async function createMCPAction(
  auth: Authenticator,
  {
    actionBaseParams,
    actionConfiguration,
    augmentedInputs,
    stepContentId,
    stepContext,
  }: {
    actionBaseParams: ActionBaseParams;
    actionConfiguration: MCPToolConfigurationType;
    augmentedInputs: Record<string, unknown>;
    stepContentId: ModelId;
    stepContext: StepContext;
  }
): Promise<{ action: AgentMCPAction; mcpAction: MCPActionType }> {
  const toolConfiguration = omit(
    actionConfiguration,
    MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
  ) as LightMCPToolConfigurationType;

  const action = await AgentMCPAction.create({
    agentMessageId: actionBaseParams.agentMessageId,
    augmentedInputs,
    citationsAllocated: stepContext.citationsCount,
    executionState: "pending",
    isError: false,
    mcpServerConfigurationId: actionBaseParams.mcpServerConfigurationId,
    stepContentId,
    stepContext,
    toolConfiguration,
    version: 0,
    workspaceId: auth.getNonNullableWorkspace().id,
  });

  const mcpAction = new MCPActionType({
    ...actionBaseParams,
    executionState: "pending",
    id: action.id,
    isError: false,
    output: null,
    type: "tool_action",
  });

  return { action, mcpAction };
}

type BaseErrorParams = {
  action: AgentMCPAction;
  actionBaseParams: ActionBaseParams;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  errorMessage: string;
  executionState: MCPExecutionState;
};

// Yields tool_error (stops conversation) - for auth/validation failures.
type YieldAsErrorParams = BaseErrorParams & {
  yieldAsError: true;
  errorCode?: string;
  errorMetadata?: Record<string, string | number | boolean> | null;
};

// Yields tool_success (continues conversation) - for timeouts/denials/execution errors.
type YieldAsSuccessParams = BaseErrorParams & {
  yieldAsError: false;
  action: AgentMCPAction;
  actionBaseParams: ActionBaseParams;
};

type HandleErrorParams = YieldAsErrorParams | YieldAsSuccessParams;

/**
 * Handles MCP action errors with type-safe discriminated union based on error severity.
 */
export async function handleMCPActionError(
  params: HandleErrorParams
): Promise<MCPErrorEvent | MCPSuccessEvent> {
  const { agentConfiguration, agentMessage, errorMessage, executionState } =
    params;

  const outputContent: CallToolResult["content"][number] = {
    type: "text",
    text: errorMessage,
  };

  const { action, actionBaseParams } = params;

  await AgentMCPActionOutputItem.create({
    workspaceId: action.workspaceId,
    agentMCPActionId: action.id,
    content: outputContent,
  });

  // Yields tool_error to stop conversation.
  if (params.yieldAsError) {
    // Update action to mark it as having an error.
    await action.update({
      isError: true,
    });

    return {
      type: "tool_error",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      error: {
        code: params.errorCode ?? "tool_error",
        message: errorMessage,
        metadata: params.errorMetadata ?? null,
      },
    };
  }

  // Yields tool_success to continue conversation.
  return {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles: [],
      executionState,
      id: action.id,
      isError: false,
      output: [outputContent],
      type: "tool_action",
    }),
  };
}

export async function updateMCPApprovalState({
  actionId,
  executionState,
}: {
  actionId: string;
  executionState: MCPExecutionState;
}): Promise<boolean> {
  // TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent mcp action.

  const id = getResourceIdFromSId(actionId);
  if (!id) {
    throw new Error(`Invalid action ID: ${actionId}`);
  }

  const action = await AgentMCPAction.findByPk(id);
  if (!action) {
    throw new Error(`Action not found: ${actionId}`);
  }

  if (action.executionState === executionState) {
    return false;
  }

  await action.update({
    executionState,
  });

  return true;
}
