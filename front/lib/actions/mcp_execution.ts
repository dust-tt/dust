import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpError } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";

import type {
  MCPActionType,
  MCPApproveExecutionEvent,
  MCPToolConfigurationType,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import type { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import { augmentInputsWithConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import {
  isBlobResource,
  isMCPProgressNotificationType,
  isResourceWithName,
  isToolApproveBubbleUpNotificationType,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { handleBase64Upload } from "@app/lib/actions/mcp_utils";
import { getMCPEvents } from "@app/lib/actions/pubsub";
import type {
  ActionGeneratedFileType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  FileUseCase,
  FileUseCaseMetadata,
  LightWorkspaceType,
  Result,
  SupportedFileContentType,
} from "@app/types";
import {
  assertNever,
  extensionsForContentType,
  isSupportedFileContentType,
  removeNulls,
  stripNullBytes,
} from "@app/types";

/**
 * Handles tool approval process and returns the final execution status.
 * Yields approval events during the process.
 */
export async function* handleToolApproval({
  auth,
  actionConfiguration,
  agentConfiguration,
  conversation,
  agentMessage,
  mcpAction,
  owner,
  localLogger,
}: {
  auth: Authenticator;
  actionConfiguration: MCPToolConfigurationType;
  agentConfiguration: AgentConfigurationType;
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  mcpAction: MCPActionType;
  owner: LightWorkspaceType;
  localLogger: Logger;
}): AsyncGenerator<
  MCPApproveExecutionEvent,
  | "allowed_implicitly"
  | "allowed_explicitly"
  | "pending"
  | "timeout"
  | "denied",
  unknown
> {
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
      inputs: mcpAction.params,
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
      throw error; // Let the caller handle this error.
    }
  }

  // The status was not updated by the event, or no event was received.
  // In this case, we set the status to timeout.
  if (status === "pending") {
    status = "timeout";
  }

  return status;
}

/**
 * Executes the MCP tool and handles progress notifications.
 * Returns the tool execution result.
 */
export async function* executeMCPTool({
  auth,
  inputs,
  agentLoopRunContext,
  action,
  agentConfiguration,
  conversation,
  agentMessage,
  mcpAction,
}: {
  auth: Authenticator;
  inputs: Record<string, unknown>;
  agentLoopRunContext: AgentLoopRunContextType;
  action: AgentMCPAction;
  agentConfiguration: AgentConfigurationType;
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  mcpAction: MCPActionType;
}): AsyncGenerator<
  ToolNotificationEvent | MCPApproveExecutionEvent,
  Result<
    CallToolResult["content"],
    Error | McpError | MCPServerPersonalAuthenticationRequiredError
  > | null,
  unknown
> {
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

  return toolCallResult;
}

/**
 * Processes tool results, handles file uploads, and creates output items.
 * Returns the processed content and generated files.
 */
export async function processToolResults({
  auth,
  toolCallResult,
  conversation,
  action,
  localLogger,
}: {
  auth: Authenticator;
  toolCallResult: CallToolResult["content"];
  conversation: ConversationType;
  action: AgentMCPAction;
  localLogger: Logger;
}): Promise<{
  outputItems: AgentMCPActionOutputItem[];
  generatedFiles: ActionGeneratedFileType[];
}> {
  const fileUseCase: FileUseCase = "conversation";
  const fileUseCaseMetadata: FileUseCaseMetadata = {
    conversationId: conversation.sId,
  };

  const cleanContent: {
    content: CallToolResult["content"][number];
    file: FileResource | null;
  }[] = await concurrentExecutor(
    toolCallResult,
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
            : `generated-image-${Date.now()}.${extensionsForContentType(block.mimeType as any)[0]}`;

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
      workspaceId: action.workspaceId,
      agentMCPActionId: action.id,
      content: c.content,
      fileId: c.file?.id,
    }))
  );

  const generatedFiles: ActionGeneratedFileType[] = removeNulls(
    cleanContent.map((c) => c.file)
  ).map((f) => ({
    contentType: f.contentType,
    fileId: f.sId,
    snippet: f.snippet,
    title: f.fileName,
  }));

  return { outputItems, generatedFiles };
}

/**
 * Helper function to augment inputs with configuration data.
 */
export function getAugmentedInputs({
  auth,
  rawInputs,
  actionConfiguration,
}: {
  auth: Authenticator;
  rawInputs: Record<string, unknown>;
  actionConfiguration: MCPToolConfigurationType;
}): Record<string, unknown> {
  return augmentInputsWithConfiguration({
    owner: auth.getNonNullableWorkspace(),
    rawInputs,
    actionConfiguration,
  });
}
