import { isSupportedImageContentType } from "@dust-tt/client";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import { FALLBACK_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  MCPToolResultContentType,
  ProgressNotificationContentType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isMCPProgressNotificationType,
  isResourceWithName,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  augmentInputsWithConfiguration,
  hideInternalConfiguration,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { getMCPEvents } from "@app/lib/actions/pubsub";
import type { ReasoningModelConfiguration } from "@app/lib/actions/reasoning";
import type { DataSourceConfiguration } from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type {
  AgentLoopRunContextType,
  BaseActionRunParams,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import {
  BaseAction,
  BaseActionConfigurationServerRunner,
} from "@app/lib/actions/types";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import {
  processAndStoreFromUrl,
  uploadBase64ImageToFileStorage,
} from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  AgentMessageType,
  FileUseCase,
  FileUseCaseMetadata,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  Result,
  TimeFrame,
} from "@app/types";
import {
  assertNever,
  extensionsForContentType,
  hasNullUnicodeCharacter,
  isSupportedFileContentType,
  Ok,
  removeNulls,
} from "@app/types";

const MAX_BLOB_SIZE_BYTES = 1024 * 1024 * 10; // 10MB

export type BaseMCPServerConfigurationType = {
  id: ModelId;

  sId: string;

  type: "mcp_server_configuration";

  name: string;
  description: string | null;
};

// Server-side MCP server = Remote MCP Server OR our own MCP server.
export type ServerSideMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    dataSources: DataSourceConfiguration[] | null;
    tables: TableDataSourceConfiguration[] | null;
    childAgentId: string | null;
    reasoningModel: ReasoningModelConfiguration | null;
    timeFrame: TimeFrame | null;
    additionalConfiguration: Record<string, boolean | number | string>;
    mcpServerViewId: string; // Hold the sId of the MCP server view.
    dustAppConfiguration: DustAppRunConfigurationType | null;
    internalMCPServerId: string | null; // As convenience, hold the sId of the internal server if it is an internal server.
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
};

export type ClientSideMCPToolType = Omit<
  ClientSideMCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
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

type MCPApproveExecutionEvent = {
  type: "tool_approve_execution";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;
  metadata: MCPValidationMetadataType;
};

export function isMCPApproveExecutionEvent(
  event: MCPActionRunningEvents
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
  };
};

export type ToolNotificationEvent = {
  type: "tool_notification";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
  notification: ProgressNotificationContentType;
};

type ActionBaseParams = Omit<
  MCPActionBlob,
  "id" | "type" | "executionState" | "output" | "isError"
>;

function hideFileContentForModel({
  fileId,
  content,
  workspaceId,
}: AgentMCPActionOutputItem): MCPToolResultContentType {
  // For tool-generated files, we keep the resource as is.
  if (!fileId || isToolGeneratedFile(content)) {
    return content;
  }
  // We want to hide the original file url from the model.
  const sid = makeSId("file", {
    workspaceId: workspaceId,
    id: fileId,
  });
  let contentType = "unknown";
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

export type MCPActionRunningEvents =
  | MCPParamsEvent
  | MCPApproveExecutionEvent
  | ToolNotificationEvent;

type MCPActionBlob = ExtractActionBlob<MCPActionType>;

// This action uses the MCP protocol to communicate
export class MCPActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly executionState:
    | "pending"
    | "timeout"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied" = "pending";

  readonly mcpServerConfigurationId: string;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly output: MCPToolResultContentType[] | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly isError: boolean = false;
  readonly type = "tool_action" as const;

  constructor(blob: MCPActionBlob) {
    super(blob.id, blob.type, blob.generatedFiles);

    this.agentMessageId = blob.agentMessageId;
    this.mcpServerConfigurationId = blob.mcpServerConfigurationId;
    this.executionState = blob.executionState;
    this.isError = blob.isError;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
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

  async renderForMultiActionsModel({
    model,
  }: {
    model: ModelConfigurationType;
  }): Promise<FunctionMessageTypeModel> {
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

    return {
      role: "function" as const,
      name: this.functionCallName,
      function_call_id: this.functionCallId,
      content: this.output
        ? JSON.stringify(this.output)
        : "Successfully executed action, no output.",
    };
  }
}

/**
 * Params generation.
 */
export class MCPConfigurationServerRunner extends BaseActionConfigurationServerRunner<MCPToolConfigurationType> {
  // Generates the action specification for generation of rawInputs passed to `run`.
  async buildSpecification(
    auth: Authenticator
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runMCPConfiguration`"
      );
    }

    // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT
    const filteredInputSchema = hideInternalConfiguration(
      this.actionConfiguration.inputSchema
    );

    return new Ok({
      name: this.actionConfiguration.name,
      description: this.actionConfiguration.description ?? "",
      inputs: [],
      inputSchema: filteredInputSchema,
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
    }: BaseActionRunParams & {
      stepActionIndex: number;
      stepActions: ActionConfigurationType[];
      citationsRefsOffset: number;
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
    const { actionConfiguration } = this;

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
          },
        };
        return;
      }
    }

    // Create the action object in the database and yield an event for
    // the generation of the params. We store the action here as the params have been generated, if
    // an error occurs later on, the error will be stored on the parent agent message.
    const action = await AgentMCPAction.create({
      ...actionBaseParams,
      workspaceId: owner.id,
      isError: false,
      executionState: "pending",
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
      actionConfiguration
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
        action: mcpAction,
        inputs: rawInputs,
        stake: isServerSideMCPToolConfiguration(actionConfiguration)
          ? actionConfiguration.permission
          : FALLBACK_MCP_TOOL_STAKE_LEVEL,
        metadata: {
          toolName: actionConfiguration.originalName,
          mcpServerName: actionConfiguration.mcpServerName,
          agentName: agentConfiguration.name,
        },
      };

      try {
        const actionEventGenerator = getMCPEvents({
          actionId: mcpAction.id,
        });

        localLogger.info(
          {
            actionName: actionConfiguration.name,
          },
          "Waiting for action validation"
        );

        // Start listening for action events
        for await (const event of actionEventGenerator) {
          const { data } = event;

          if (
            data.type === "always_approved" &&
            data.actionId === mcpAction.id
          ) {
            assert(isServerSideMCPToolConfiguration(actionConfiguration));
            const user = auth.getNonNullableUser();
            await user.appendToMetadata(
              `toolsValidations:${actionConfiguration.toolServerId}`,
              `${actionConfiguration.name}`
            );
          }

          if (
            (data.type === "approved" || data.type === "always_approved") &&
            data.actionId === mcpAction.id
          ) {
            status = "allowed_explicitly";
            break;
          } else if (
            data.type === "rejected" &&
            data.actionId === mcpAction.id
          ) {
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

    if (status === "timeout") {
      localLogger.info("Tool validation timed out");
      yield buildErrorEvent(
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
      localLogger.info("Action execution rejected by user");
      yield buildErrorEvent(
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
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
    };

    let toolCallResult: Result<
      MCPToolResultContentType[],
      Error | McpError
    > | null = null;
    for await (const event of tryCallMCPTool(
      auth,
      inputs,
      agentLoopRunContext,
      {
        progressToken: action.id,
      }
    )) {
      if (event.type === "result") {
        toolCallResult = event.result;
      } else if (event.type === "notification") {
        const { notification } = event;
        if (isMCPProgressNotificationType(notification)) {
          yield {
            type: "tool_notification",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: mcpAction,
            notification: notification.params,
          };
        }
      }
    }

    if (!toolCallResult || toolCallResult.isErr()) {
      localLogger.error(
        {
          error: toolCallResult?.error?.message,
        },
        "Error calling MCP tool on run."
      );
      await action.update({
        isError: true,
      });

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
        "An error occured while executing the tool. You can inform the user of this issue.";

      yield buildErrorEvent(
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
      content: MCPToolResultContentType;
      file: FileResource | null;
    }[] = await concurrentExecutor(
      toolCallResult.value,
      async (block) => {
        //  const cleanBlock: MCPToolResultContentType = { ...block };
        //  let file: FileResource | null = null;

        switch (block.type) {
          case "text":
            // Return as is.
            return {
              content: block,
              file: null,
            };

          case "image":
            if (block.data.length > MAX_BLOB_SIZE_BYTES) {
              return {
                content: {
                  type: "text",
                  text: "The generated image was too large to be stored",
                },
                file: null,
              };
            } else if (isSupportedImageContentType(block.mimeType)) {
              try {
                const imageUpsertResult = await uploadBase64ImageToFileStorage(
                  auth,
                  {
                    base64: block.data,
                    contentType: block.mimeType,
                    fileName: isResourceWithName(block)
                      ? block.name
                      : `generated-image-${Date.now()}.${extensionsForContentType(block.mimeType)[0]}`,
                    useCase: fileUseCase,
                    useCaseMetadata: fileUseCaseMetadata,
                  }
                );

                if (imageUpsertResult.isErr()) {
                  localLogger.error(
                    { error: imageUpsertResult.error },
                    "Error upserting image from base64"
                  );
                  return {
                    content: {
                      type: "text",
                      text: "Failed to upsert the generated image as a file.",
                    },
                    file: null,
                  };
                } else {
                  return {
                    content: {
                      ...block,
                      data: "", // Remove the data from the block to avoid storing it in the database.
                    },
                    file: imageUpsertResult.value,
                  };
                }
              } catch (error) {
                logger.error(
                  {
                    action: "mcp_tool",
                    tool: "generate_image",
                    workspaceId: owner.sId,
                    error,
                  },
                  "Failed to save the generated image."
                );

                return {
                  content: {
                    type: "text",
                    text: "Failed to save the generated image.",
                  },
                  file: null,
                };
              }
            } else {
              return {
                content: {
                  type: "text",
                  text: "The generated image mime type is not supported",
                },
                file: null,
              };
            }

          case "resource":
            // File generated by the tool, already upserted.
            if (isToolGeneratedFile(block)) {
              // Retrieve the file for the FK in the AgentMCPActionOutputItem.
              const file = await FileResource.fetchById(
                auth,
                block.resource.fileId
              );

              return {
                content: block,
                file,
              };
            }
            // File generated by the tool, not yet upserted.
            else if (
              block.resource.mimeType &&
              isSupportedFileContentType(block.resource.mimeType)
            ) {
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
              } else {
                return {
                  content: block,
                  file: fileUpsertResult.value,
                };
              }
            } else {
              return {
                content: block,
                file: null,
              };
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

    yield {
      type: "tool_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPActionType({
        ...actionBaseParams,
        generatedFiles: removeNulls(cleanContent.map((c) => c.file)).map(
          (f) => ({
            fileId: f.sId,
            contentType: f.contentType,
            title: f.fileName,
            snippet: f.snippet,
          })
        ),
        executionState: status,
        id: action.id,
        isError: false,
        output: outputItems.map(hideFileContentForModel),
        type: "tool_action",
      }),
    };
  }
}

// Build a tool success event with an error message.
// We show as success as we want the model to continue the conversation.
const buildErrorEvent = (
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
) => {
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
      output: [
        {
          type: "text",
          text: errorMessage,
        },
      ],
      type: "tool_action",
    }),
  };
};

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a MCPAction actions. This
// should not be used outside of api/assistant. We allow a ModelId interface here because we don't
// have `sId` on actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of
// this action).
export async function mcpActionTypesFromAgentMessageIds(
  auth: Authenticator,
  { agentMessageIds }: { agentMessageIds: ModelId[] }
): Promise<MCPActionType[]> {
  const actions = await AgentMCPAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    include: [
      {
        model: AgentMCPActionOutputItem,
        as: "outputItems",
        required: false,
        include: [
          {
            model: FileModel,
            as: "file",
            required: false,
          },
        ],
      },
    ],
  });

  return actions.map((action) => {
    return new MCPActionType({
      id: action.id,
      params: action.params,
      output: action.outputItems.map(hideFileContentForModel),
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      mcpServerConfigurationId: action.mcpServerConfigurationId,
      executionState: action.executionState,
      isError: action.isError,
      type: "tool_action",
      generatedFiles: removeNulls(
        action.outputItems.map((o) => {
          if (!o.file) {
            return null;
          }

          const file = o.file;
          const fileSid = FileResource.modelIdToSId({
            id: file.id,
            workspaceId: action.workspaceId,
          });

          return {
            fileId: fileSid,
            contentType: file.contentType,
            title: file.fileName,
            snippet: file.snippet,
          };
        })
      ),
    });
  });
}
