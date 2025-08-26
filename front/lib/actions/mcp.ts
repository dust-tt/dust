import type { ActionApprovalStateType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import omit from "lodash/omit";

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
import type {
  InternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { ToolBlockedAwaitingInputError } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import {
  hideFileFromActionOutput,
  rewriteContentForModel,
} from "@app/lib/actions/mcp_utils";
import type {
  ToolExecutionBlockedStatus,
  ToolExecutionStatus,
} from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
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
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
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
    additionalConfiguration: AdditionalConfigurationType;
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

export type ToolExecutionMetadata = {
  conversationId: string;
  messageId: string;
  actionId: string;

  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;

  mcpServerId?: string;
  metadata: MCPValidationMetadataType;
};

export type BlockedActionExecution = ToolExecutionMetadata & {
  status: ToolExecutionBlockedStatus;
  authorizationInfo: AuthorizationInfo | null;
};

// TODO(durable-agents): cleanup the types of the events.
export type MCPApproveExecutionEvent = ToolExecutionMetadata & {
  type: "tool_approve_execution";
  created: number;
  configurationId: string;
  isLastBlockingEventForStep?: boolean;
};

export function getMCPApprovalStateFromUserApprovalState(
  userApprovalState: ActionApprovalStateType
) {
  switch (userApprovalState) {
    case "always_approved":
    case "approved":
      return "ready_allowed_explicitly";

    case "rejected":
      return "denied";

    default:
      assertNever(userApprovalState);
  }
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

export type ActionBaseParams = Omit<MCPActionBlob, "id" | "type" | "output">;

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

  readonly mcpServerConfigurationId: string;
  readonly mcpServerId: string | null;
  readonly internalMCPServerName: InternalMCPServerNameType | null;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly output: CallToolResult["content"] | null;

  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;

  readonly citationsAllocated: number = 0;

  readonly type = "tool_action" as const;
  readonly status: ToolExecutionStatus;

  constructor(blob: MCPActionBlob) {
    this.id = blob.id;
    this.type = blob.type;
    this.generatedFiles = blob.generatedFiles;

    this.agentMessageId = blob.agentMessageId;
    this.mcpServerConfigurationId = blob.mcpServerConfigurationId;
    this.mcpServerId = blob.mcpServerId;
    this.internalMCPServerName = blob.internalMCPServerName;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
    this.citationsAllocated = blob.citationsAllocated;
    this.status = blob.status;
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

    if (this.status === "denied") {
      return {
        role: "function" as const,
        name: this.functionCallName,
        function_call_id: this.functionCallId,
        content:
          "The user rejected this specific action execution. Using this action is hence forbidden for this message.",
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
  }: {
    action: AgentMCPActionResource;
    actionBaseParams: ActionBaseParams;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
    mcpAction: MCPActionType;
  }
): AsyncGenerator<
  | MCPApproveExecutionEvent
  | MCPErrorEvent
  | MCPParamsEvent
  | MCPSuccessEvent
  | ToolNotificationEvent
  | ToolPersonalAuthRequiredEvent,
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

  const { status } = mcpAction;

  // Use the augmented inputs that were computed and stored during action creation
  const inputs = action.augmentedInputs;

  const agentLoopRunContext: AgentLoopRunContextType = {
    agentConfiguration,
    agentMessage,
    conversation,
    stepContext: action.stepContext,
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

    const { error: toolErr } = toolCallResult ?? {};

    // If we got a personal authentication error, we emit a specific event that will be
    // deferred until after all tools complete, then converted to a tool_error.
    if (MCPServerPersonalAuthenticationRequiredError.is(toolErr)) {
      const authErrorMessage =
        `The tool ${actionBaseParams.functionCallName} requires personal ` +
        `authentication, please authenticate to use it.`;

      // Update the action to mark it as blocked because of a personal authentication error.
      await action.updateStatus("blocked_authentication_required");

      yield {
        type: "tool_personal_auth_required",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        conversationId: conversation.sId,
        authError: {
          mcpServerId: toolErr.mcpServerId,
          provider: toolErr.provider,
          toolName: actionBaseParams.functionCallName ?? "unknown",
          message: authErrorMessage,
          ...(toolErr.scope && {
            scope: toolErr.scope,
          }),
        },
      };

      return;
    } else if (toolErr instanceof ToolBlockedAwaitingInputError) {
      // Update the step context to save the resume state.
      await action.updateStepContext({
        ...action.stepContext,
        resumeState: toolErr.resumeState,
      });

      // Yield the blocking events.
      for (const event of toolErr.blockingEvents) {
        yield event;
      }

      return;
    }

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
      status,
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

  await action.updateStatus("succeeded");

  yield {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles,
      status: "succeeded",
      id: action.id,
      output: removeNulls(outputItems.map(hideFileFromActionOutput)),
      type: "tool_action",
    }),
  };
}

/**
 * Creates an MCP action in the database and returns both the DB record and the type object.
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
): Promise<{ action: AgentMCPActionResource; mcpAction: MCPActionType }> {
  const toolConfiguration = omit(
    actionConfiguration,
    MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
  ) as LightMCPToolConfigurationType;

  const action = await AgentMCPActionResource.makeNew(auth, {
    agentMessageId: actionBaseParams.agentMessageId,
    augmentedInputs,
    citationsAllocated: stepContext.citationsCount,
    mcpServerConfigurationId: actionBaseParams.mcpServerConfigurationId,
    status: actionBaseParams.status,
    stepContentId,
    stepContext,
    toolConfiguration,
    version: 0,
  });

  const mcpAction = new MCPActionType({
    ...actionBaseParams,
    id: action.id,
    output: null,
    type: "tool_action",
  });

  return { action, mcpAction };
}

type BaseErrorParams = {
  action: AgentMCPActionResource;
  actionBaseParams: ActionBaseParams;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  errorMessage: string;
  status: ToolExecutionStatus;
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
  actionBaseParams: ActionBaseParams;
};

type HandleErrorParams = YieldAsErrorParams | YieldAsSuccessParams;

/**
 * Handles MCP action errors with type-safe discriminated union based on error severity.
 */
export async function handleMCPActionError(
  params: HandleErrorParams
): Promise<MCPErrorEvent | MCPSuccessEvent> {
  const { agentConfiguration, agentMessage, errorMessage, status } = params;

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
    // Update the action to mark it as having an error.
    await action.updateStatus("errored");

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

  // If the tool is not already in a final state, we set it to errored (could be denied).
  if (!isToolExecutionStatusFinal(status)) {
    await action.updateStatus("errored");
  }

  // Yields tool_success to continue the conversation.
  return {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles: [],
      status,
      id: action.id,
      output: [outputContent],
      type: "tool_action",
    }),
  };
}

export function isMCPApproveExecutionEvent(
  event: unknown
): event is MCPApproveExecutionEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_approve_execution"
  );
}

function isToolPersonalAuthRequiredEvent(
  event: unknown
): event is ToolPersonalAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_error" &&
    "error" in event &&
    typeof event.error === "object" &&
    event.error !== null &&
    "code" in event.error &&
    event.error.code === "mcp_server_personal_authentication_required"
  );
}

export function isBlockedActionEvent(
  event: unknown
): event is MCPApproveExecutionEvent | ToolPersonalAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (isMCPApproveExecutionEvent(event) ||
      isToolPersonalAuthRequiredEvent(event))
  );
}

// TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent mcp action.
export async function getMCPAction(
  auth: Authenticator,
  actionId: string
): Promise<AgentMCPActionResource | null> {
  const id = getResourceIdFromSId(actionId);
  if (!id) {
    throw new Error(`Invalid action ID: ${actionId}`);
  }
  return AgentMCPActionResource.fetchByModelIdWithAuth(auth, id);
}

// TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent mcp action.
export async function updateMCPApprovalState(
  action: AgentMCPActionResource,
  approvalState: "denied" | "ready_allowed_explicitly"
): Promise<boolean> {
  if (action.status === approvalState) {
    return false;
  }

  await action.updateStatus(approvalState);

  return true;
}
