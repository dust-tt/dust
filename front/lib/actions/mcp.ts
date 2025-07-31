import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import {
  executeMCPTool,
  getAugmentedInputs,
  handleToolApproval,
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
  validateToolInputs,
} from "@app/lib/actions/mcp_utils";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { makeSId } from "@app/lib/resources/string_ids";
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
  Result,
  TimeFrame,
} from "@app/types";
import { Ok, removeNulls } from "@app/types";

export type BaseMCPServerConfigurationType = {
  id: ModelId;

  sId: string;

  type: "mcp_server_configuration";

  name: string;
  mcpServerName: string | null;

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

export function isMCPApproveExecutionEvent(
  event: AgentActionRunningEvents
): event is MCPApproveExecutionEvent {
  return event.type === "tool_approve_execution";
}

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

// TODO(MCP 2025-05-06): Add action to the error event.
type MCPErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
    // TODO(2025-07-22 aubin): make this non nullable (we can always pass an empty object).
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
  readonly executionState:
    | "pending"
    | "timeout"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied" = "pending";

  readonly mcpServerConfigurationId: string;
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

/**
 * Builds a tool specification for the given MCP action configuration.
 */
export async function buildToolSpecification(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Unexpected unauthenticated call to `buildToolSpecification`"
    );
  }

  // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT
  const filteredInputSchema = hideInternalConfiguration(
    actionConfiguration.inputSchema
  );

  return new Ok({
    name: actionConfiguration.name,
    description: actionConfiguration.description ?? "",
    inputs: [],
    inputSchema: filteredInputSchema,
  });
}

/**
 * Runs a tool with streaming for the given MCP action configuration.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  {
    agentConfiguration,
    conversation,
    agentMessage,
    rawInputs,
    functionCallId,
    step,
    stepContentId,
    stepContext,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    rawInputs: Record<string, unknown>;
    functionCallId: string;
    step: number;
    stepContentId: ModelId;
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

  const localLogger = logger.child({
    actionConfigurationId: actionConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    workspaceId: conversation.owner.sId,
  });

  const actionBaseParams: ActionBaseParams = {
    agentMessageId: agentMessage.agentMessageId,
    functionCallId,
    functionCallName: actionConfiguration.name,
    generatedFiles: [],
    mcpServerConfigurationId: `${actionConfiguration.id}`,
    params: rawInputs,
    step,
    citationsAllocated: stepContext.citationsCount,
  };

  const validateToolInputsResult = validateToolInputs(rawInputs);
  if (validateToolInputsResult.isErr()) {
    yield await handleMCPActionError({
      agentConfiguration,
      agentMessage,
      executionState: "denied",
      errorMessage: validateToolInputsResult.error.message,
      yieldAsError: true,
    });
    return;
  }

  // Create the action object in the database and yield an event for
  // the generation of the params. We store the action here as the params have been generated, if
  // an error occurs later on, the error will be stored on the parent agent message.
  const { action, mcpAction } = await createMCPAction({
    actionBaseParams,
    owner,
    stepContentId,
    stepContext,
  });

  yield {
    type: "tool_params",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: mcpAction,
  };

  let status:
    | "allowed_implicitly"
    | "allowed_explicitly"
    | "pending"
    | "timeout"
    | "denied";

  try {
    status = yield* handleToolApproval({
      auth,
      actionConfiguration,
      agentConfiguration,
      conversation,
      agentMessage,
      mcpAction,
      owner,
      localLogger,
    });
  } catch (error) {
    yield await handleMCPActionError({
      agentConfiguration,
      agentMessage,
      executionState: "denied",
      errorMessage: `Error checking action validation status: ${JSON.stringify(error)}`,
      yieldAsError: true,
    });
    return;
  }

  await action.update({
    executionState: status,
  });

  const tags = [
    `action:${actionConfiguration.name}`,
    `mcp_server:${actionConfiguration.mcpServerName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
  ];

  if (status === "timeout") {
    statsDClient.increment("mcp_actions_timeout.count", 1, tags);
    localLogger.info(
      {
        workspaceId: owner.sId,
        actionName: actionConfiguration.name,
      },
      "Tool validation timed out"
    );
    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      executionState: "denied",
      errorMessage:
        "The action validation timed out. Using this action is hence forbidden for this message.",
      yieldAsError: false,
    });
    return;
  }

  if (status === "denied") {
    statsDClient.increment("mcp_actions_denied.count", 1, tags);
    localLogger.info(
      {
        workspaceId: owner.sId,
        actionName: actionConfiguration.name,
      },
      "Action execution rejected by user"
    );
    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      executionState: "denied",
      errorMessage:
        "The user rejected this specific action execution. Using this action is hence forbidden for this message.",
      yieldAsError: false,
    });
    return;
  }

  // We put back the preconfigured inputs (data sources for instance) from the agent configuration if any.
  const inputs = getAugmentedInputs({
    auth,
    rawInputs,
    actionConfiguration,
  });

  const agentLoopRunContext: AgentLoopRunContextType = {
    actionConfiguration,
    agentConfiguration,
    conversation,
    agentMessage,
    stepContext,
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
        workspaceId: owner.sId,
        actionName: actionConfiguration.name,
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
        `The tool ${actionConfiguration.originalName} requires personal ` +
        `authentication, please authenticate to use it.`;

      yield await handleMCPActionError({
        agentConfiguration,
        agentMessage,
        executionState: status,
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
      errorMessage = `The tool ${actionConfiguration.originalName} timed out. `;
    } else {
      errorMessage = `The tool ${actionConfiguration.originalName} returned an error. `;
    }
    errorMessage +=
      "An error occurred while executing the tool. You can inform the user of this issue.";

    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      executionState: status,
      errorMessage,
      yieldAsError: false,
    });
    return;
  }

  const { outputItems, generatedFiles } = await processToolResults({
    auth,
    toolCallResult: toolCallResult.value,
    conversation,
    action,
    localLogger,
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
      executionState: status,
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
export async function createMCPAction({
  actionBaseParams,
  owner,
  stepContentId,
  stepContext,
}: {
  actionBaseParams: ActionBaseParams;
  owner: LightWorkspaceType;
  stepContentId: ModelId;
  stepContext: StepContext;
}): Promise<{ action: AgentMCPAction; mcpAction: MCPActionType }> {
  const action = await AgentMCPAction.create({
    agentMessageId: actionBaseParams.agentMessageId,
    mcpServerConfigurationId: actionBaseParams.mcpServerConfigurationId,
    workspaceId: owner.id,
    isError: false,
    executionState: "pending",
    version: 0,
    stepContentId,
    citationsAllocated: stepContext.citationsCount,
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
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  errorMessage: string;
  executionState:
    | "pending"
    | "timeout"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied";
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

  // Yields tool_error to stop conversation.
  if (params.yieldAsError) {
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

  const { action, actionBaseParams } = params;

  await AgentMCPActionOutputItem.create({
    workspaceId: action.workspaceId,
    agentMCPActionId: action.id,
    content: outputContent,
  });

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
