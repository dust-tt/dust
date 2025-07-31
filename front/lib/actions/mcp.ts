import { isSupportedImageContentType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import type {
  CustomServerIconType,
  InternalAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  augmentInputsWithConfiguration,
  hideInternalConfiguration,
} from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isBlobResource,
  isMCPProgressNotificationType,
  isResourceWithName,
  isSearchQueryResourceType,
  isTextContent,
  isToolApproveBubbleUpNotificationType,
  isToolGeneratedFile,
  isToolMarkerResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getMCPEvents } from "@app/lib/actions/pubsub";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import type { StepContext } from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  processAndStoreFromUrl,
  uploadBase64DataToFileStorage,
  uploadBase64ImageToFileStorage,
} from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  DustAppRunConfigurationType,
  FileUseCase,
  FileUseCaseMetadata,
  FunctionCallType,
  FunctionMessageTypeModel,
  LightWorkspaceType,
  ModelConfigurationType,
  ModelId,
  ReasoningModelConfigurationType,
  Result,
  SupportedFileContentType,
  SupportedImageContentType,
  TimeFrame,
} from "@app/types";
import {
  assertNever,
  extensionsForContentType,
  hasNullUnicodeCharacter,
  isSupportedFileContentType,
  Ok,
  removeNulls,
  stripNullBytes,
} from "@app/types";

const MAX_BLOB_SIZE_BYTES = 1024 * 1024 * 10; // 10MB

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

export function hideFileFromActionOutput({
  fileId,
  content,
  workspaceId,
}: AgentMCPActionOutputItem): CallToolResult["content"][number] | null {
  // For tool-generated files and non-file content, we keep the resource as is.
  if (!fileId || isToolGeneratedFile(content)) {
    return content;
  }
  // We want to hide the original file url from the model.
  const sid = FileResource.modelIdToSId({
    id: fileId,
    workspaceId,
  });
  let contentType;
  switch (content.type) {
    case "text":
      contentType = "text/plain";
      break;
    case "image":
      contentType = content.mimeType;
      break;
    case "resource":
      contentType = content.resource.mimeType ?? "unknown";
      break;
    default:
      contentType = "unknown";
      break;
  }
  return {
    type: "text",
    text: `A file of type ${contentType} with id ${sid} was generated successfully and made available to the conversation.`,
  };
}

function rewriteContentForModel(
  content: CallToolResult["content"][number]
): CallToolResult["content"][number] | null {
  // Only render tool generated files that are supported.
  if (
    isToolGeneratedFile(content) &&
    isSupportedFileContentType(content.resource.contentType)
  ) {
    const attachment = getAttachmentFromToolOutput({
      fileId: content.resource.fileId,
      contentType: content.resource.contentType,
      title: content.resource.title,
      snippet: content.resource.snippet,
    });
    const xml = renderAttachmentXml({ attachment });
    let text = content.resource.text;
    if (text) {
      text += `\n`;
    }
    text += xml;
    return {
      type: "text",
      text,
    };
  }

  if (isSearchQueryResourceType(content) || isToolMarkerResourceType(content)) {
    return null;
  }

  return content;
}

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

  for (const value of Object.values(rawInputs)) {
    if (typeof value === "string" && hasNullUnicodeCharacter(value)) {
      yield {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tool_error",
          message: "Invalid Unicode character in inputs, please retry.",
          metadata: null,
        },
      };
      return;
    }
  }

  // Create the action object in the database and yield an event for
  // the generation of the params. We store the action here as the params have been generated, if
  // an error occurs later on, the error will be stored on the parent agent message.
  const action = await AgentMCPAction.create({
    agentMessageId: agentMessage.agentMessageId,
    mcpServerConfigurationId: `${actionConfiguration.id}`,
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

  yield {
    type: "tool_params",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: mcpAction,
  };

  const { status: s } = await getExecutionStatusFromConfig(
    auth,
    actionConfiguration,
    agentMessage
  );
  let status:
    | "allowed_implicitly"
    | "allowed_explicitly"
    | "pending"
    | "timeout"
    | "denied" = s;

  if (status === "pending") {
    yield {
      type: "tool_approve_execution",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      conversationId: conversation.sId,
      actionId: mcpAction.getSId(owner),
      action: mcpAction,
      inputs: rawInputs,
      stake: actionConfiguration.permission,
      metadata: {
        toolName: actionConfiguration.originalName,
        mcpServerName: actionConfiguration.mcpServerName,
        agentName: agentConfiguration.name,
        icon: actionConfiguration.icon,
      },
    };

    try {
      const actionEventGenerator = getMCPEvents({
        actionId: mcpAction.getSId(owner),
      });

      localLogger.info(
        {
          workspaceId: owner.sId,
          actionName: actionConfiguration.name,
        },
        "Waiting for action validation"
      );

      // Start listening for action events
      for await (const event of actionEventGenerator) {
        const { data } = event;

        // Check that the event is indeed for this action.
        if (getResourceIdFromSId(data.actionId) !== mcpAction.id) {
          status = "denied";
          break;
        }

        if (data.type === "always_approved") {
          const user = auth.getNonNullableUser();
          await user.appendToMetadata(
            `toolsValidations:${actionConfiguration.toolServerId}`,
            `${actionConfiguration.name}`
          );
        }

        if (data.type === "approved" || data.type === "always_approved") {
          status = "allowed_explicitly";
          break;
        } else if (data.type === "rejected") {
          status = "denied";
          break;
        }
      }
    } catch (error) {
      localLogger.error({ error }, "Error checking action validation status");
      yield {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tool_error",
          message: `Error checking action validation status: ${JSON.stringify(error)}`,
          metadata: null,
        },
      };
      return;
    }
  }

  // The status was not updated by the event, or no event was received.
  // In this case, we set the status to timeout.
  if (status === "pending") {
    status = "timeout";
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
    yield updateResourceAndBuildErrorEvent(
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      "denied",
      "The action validation timed out. Using this action is hence forbidden for this message."
    );
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
    yield updateResourceAndBuildErrorEvent(
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      "denied",
      "The user rejected this specific action execution. Using this action is hence forbidden for this message."
    );
    return;
  }

  // We put back the preconfigured inputs (data sources for instance) from the agent configuration if any.
  const inputs = augmentInputsWithConfiguration({
    owner: auth.getNonNullableWorkspace(),
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

  let toolCallResult: Result<
    CallToolResult["content"],
    Error | McpError | MCPServerPersonalAuthenticationRequiredError
  > | null = null;
  for await (const event of tryCallMCPTool(auth, inputs, agentLoopRunContext, {
    progressToken: action.id,
  })) {
    if (event.type === "result") {
      toolCallResult = event.result;
    } else if (event.type === "notification") {
      const { notification } = event;
      if (isMCPProgressNotificationType(notification)) {
        const { output: notificationOutput } = notification.params.data;
        // Tool approval notifications have a specific handling:
        // they are not yielded as regular notifications but are bubbled up as
        // `tool_approval_bubble_up` events instead. We attach the messageId from the
        // main conversation as `pubsubMessageId` to route the event to the main conversation channel.
        if (isToolApproveBubbleUpNotificationType(notificationOutput)) {
          const {
            conversationId,
            messageId,
            configurationId,
            actionId,
            inputs,
            stake,
            metadata,
          } = notificationOutput;

          yield {
            created: Date.now(),
            type: "tool_approve_execution",
            // Added to make it backwards compatible, this is not the action of sub agent but it won't be used.
            // TODO(MCP 2025-06-09): Remove this once all extensions are updated.
            action: mcpAction,
            configurationId,
            conversationId,
            messageId,
            actionId,
            inputs,
            stake,
            metadata: {
              ...metadata,
              pubsubMessageId: agentMessage.sId,
            },
          };
        } else {
          // Regular notifications, we yield them as is with the type "tool_notification".
          yield {
            type: "tool_notification",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
            messageId: agentMessage.sId,
            action: mcpAction,
            notification: notification.params,
          };
        }
      }
    }
  }

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
    await action.update({
      isError: true,
    });

    // If we got a personal authentication error, we emit a `tool_error` which will get turned
    // into an `agent_error` with metadata set such that we can display an invitation to connect
    // to the user.
    if (
      MCPServerPersonalAuthenticationRequiredError.is(toolCallResult?.error)
    ) {
      yield {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "mcp_server_personal_authentication_required",
          message:
            `The tool ${actionConfiguration.originalName} requires personal ` +
            `authentication, please authenticate to use it.`,
          metadata: {
            mcp_server_id: toolCallResult.error.mcpServerId,
            provider: toolCallResult.error.provider,
            ...(toolCallResult.error.scope && {
              scope: toolCallResult.error.scope,
            }),
          },
        },
      };
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

    yield updateResourceAndBuildErrorEvent(
      action,
      agentConfiguration,
      agentMessage,
      actionBaseParams,
      status,
      errorMessage
    );
    return;
  }

  const fileUseCase: FileUseCase = "conversation";
  const fileUseCaseMetadata: FileUseCaseMetadata = {
    conversationId: conversation.sId,
  };

  const cleanContent: {
    content: CallToolResult["content"][number];
    file: FileResource | null;
  }[] = await concurrentExecutor(
    toolCallResult.value,
    async (block) => {
      switch (block.type) {
        case "text": {
          return {
            content: {
              type: block.type,
              text: stripNullBytes(block.text),
            },
            file: null,
          };
        }
        case "image": {
          const fileName = isResourceWithName(block)
            ? block.name
            : `generated-image-${Date.now()}.${extensionsForContentType(block.mimeType as SupportedImageContentType)[0]}`;

          return handleBase64Upload(auth, {
            base64Data: block.data,
            mimeType: block.mimeType,
            fileName,
            block,
            fileUseCase,
            fileUseCaseMetadata,
          });
        }
        case "audio": {
          return {
            content: block,
            file: null,
          };
        }
        case "resource": {
          // File generated by the tool, already upserted.
          if (isToolGeneratedFile(block)) {
            // Retrieve the file for the FK in the AgentMCPActionOutputItem.
            const file = await FileResource.fetchById(
              auth,
              block.resource.fileId
            );

            return {
              content: {
                type: block.type,
                resource: {
                  ...block.resource,
                  text: stripNullBytes(block.resource.text),
                },
              },
              file,
            };
          } else if (
            block.resource.mimeType &&
            // File generated by the tool, not upserted yet.
            isSupportedFileContentType(block.resource.mimeType)
          ) {
            if (isBlobResource(block)) {
              const fileName = isResourceWithName(block)
                ? block.name
                : `generated-file-${Date.now()}${extensionsForContentType(block.resource.mimeType as SupportedFileContentType)[0]}`;

              return handleBase64Upload(auth, {
                base64Data: block.resource.blob,
                mimeType: block.resource.mimeType,
                fileName,
                block,
                fileUseCase,
                fileUseCaseMetadata,
              });
            }

            const fileName = isResourceWithName(block.resource)
              ? block.resource.name
              : block.resource.uri.split("/").pop() ?? "generated-file";

            const fileUpsertResult = await processAndStoreFromUrl(auth, {
              url: block.resource.uri,
              useCase: fileUseCase,
              useCaseMetadata: fileUseCaseMetadata,
              fileName,
              contentType: block.resource.mimeType,
            });

            if (fileUpsertResult.isErr()) {
              localLogger.error(
                { error: fileUpsertResult.error },
                "Error upserting file"
              );
              return {
                content: {
                  type: "text",
                  text: "Failed to upsert the generated file.",
                },
                file: null,
              };
            }

            return {
              content: block,
              file: fileUpsertResult.value,
            };
          } else {
            // Generic case for other kinds of resources.
            return {
              content: {
                type: block.type,
                resource: {
                  ...block.resource,
                  ...("text" in block.resource &&
                  typeof block.resource.text === "string"
                    ? { text: stripNullBytes(block.resource.text) }
                    : {}),
                },
              },
              file: null,
            };
          }
        }
        default:
          assertNever(block);
      }
    },
    {
      concurrency: 10,
    }
  );

  const outputItems = await AgentMCPActionOutputItem.bulkCreate(
    cleanContent.map((c) => ({
      workspaceId: owner.id,
      agentMCPActionId: action.id,
      content: c.content,
      fileId: c.file?.id,
    }))
  );

  statsDClient.increment("mcp_actions_success.count", 1, tags);

  yield {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: new MCPActionType({
      ...actionBaseParams,
      generatedFiles: removeNulls(cleanContent.map((c) => c.file)).map((f) => ({
        contentType: f.contentType,
        fileId: f.sId,
        snippet: f.snippet,
        title: f.fileName,
      })),
      executionState: status,
      id: action.id,
      isError: false,
      output: removeNulls(outputItems.map(hideFileFromActionOutput)),
      type: "tool_action",
    }),
  };
}

// Build a tool success event with an error message.
// We show as success as we want the model to continue the conversation.
async function updateResourceAndBuildErrorEvent(
  action: AgentMCPAction,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  actionBaseParams: ActionBaseParams,
  executionState:
    | "pending"
    | "timeout"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied",
  errorMessage: string
) {
  const outputContent: CallToolResult["content"][number] = {
    type: "text",
    text: errorMessage,
  };
  await AgentMCPActionOutputItem.create({
    workspaceId: action.workspaceId,
    agentMCPActionId: action.id,
    content: outputContent,
  });

  return {
    type: "tool_success" as const,
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

async function handleBase64Upload(
  auth: Authenticator,
  {
    base64Data,
    fileName,
    block,
    mimeType,
    fileUseCase,
    fileUseCaseMetadata,
  }: {
    base64Data: string;
    mimeType: string;
    fileName: string;
    block: CallToolResult["content"][number];
    fileUseCase: FileUseCase;
    fileUseCaseMetadata: FileUseCaseMetadata;
  }
): Promise<{
  content: CallToolResult["content"][number];
  file: FileResource | null;
}> {
  const resourceType = isSupportedFileContentType(mimeType)
    ? "file"
    : isSupportedImageContentType(mimeType)
      ? "image"
      : null;

  if (!resourceType) {
    return {
      content: {
        type: "text",
        text: `The mime type of the generated resource (${mimeType}) is not supported.`,
      },
      file: null,
    };
  }

  if (base64Data.length > MAX_BLOB_SIZE_BYTES) {
    return {
      content: {
        type: "text",
        text: `The generated ${resourceType} was too large to be stored.`,
      },
      file: null,
    };
  }

  try {
    const uploadResult =
      resourceType === "image"
        ? await uploadBase64ImageToFileStorage(auth, {
            base64: base64Data,
            // Cast is valid because of the previous check.
            contentType: mimeType as SupportedImageContentType,
            fileName,
            useCase: fileUseCase,
            useCaseMetadata: fileUseCaseMetadata,
          })
        : await uploadBase64DataToFileStorage(auth, {
            base64: base64Data,
            // Cast is valid because of the previous check.
            contentType: mimeType as SupportedFileContentType,
            fileName,
            useCase: fileUseCase,
            useCaseMetadata: fileUseCaseMetadata,
          });

    if (uploadResult.isErr()) {
      logger.error(
        { error: uploadResult.error },
        `Error upserting ${resourceType} from base64`
      );
      return {
        content: {
          type: "text",
          text: `Failed to upsert the generated ${resourceType} as a file.`,
        },
        file: null,
      };
    }

    return {
      content: {
        ...block,
        // Remove the data from the block to avoid storing it in the database.
        ...(block.type === "image" ? { data: "" } : {}),
        ...(isBlobResource(block)
          ? { resource: { ...block.resource, blob: "" } }
          : {}),
      },
      file: uploadResult.value,
    };
  } catch (error) {
    logger.error(
      {
        action: "mcp_tool",
        tool: `generate_${resourceType}`,
        workspaceId: auth.getNonNullableWorkspace().sId,
        error,
      },
      `Failed to save the generated ${resourceType}.`
    );

    return {
      content: {
        type: "text",
        text: `Failed to save the generated ${resourceType}.`,
      },
      file: null,
    };
  }
}
