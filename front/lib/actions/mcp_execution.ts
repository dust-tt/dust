import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";

import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import {
  computeTextByteSize,
  MAX_RESOURCE_CONTENT_SIZE,
  MAX_TEXT_CONTENT_SIZE,
  MAXED_OUTPUT_FILE_SNIPPET_LENGTH,
} from "@app/lib/actions/action_output_limits";
import type {
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { augmentInputsWithConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  isBlobResource,
  isResourceWithName,
  isRunAgentQueryProgressOutput,
  isStoreResourceProgressOutput,
  isToolGeneratedFile,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { handleBase64Upload } from "@app/lib/actions/mcp_utils";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
} from "@app/types";
import {
  assertNever,
  extensionsForContentType,
  isSupportedFileContentType,
  removeNulls,
  stripNullBytes,
} from "@app/types";

export async function processToolNotification(
  notification: MCPProgressNotificationType,
  {
    action,
    agentConfiguration,
    conversation,
    agentMessage,
  }: {
    action: AgentMCPActionResource;
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
  }
): Promise<ToolNotificationEvent> {
  const output = notification.params.data.output;

  // Handle store_resource notifications by creating output items immediately
  if (isStoreResourceProgressOutput(output)) {
    await AgentMCPActionOutputItem.bulkCreate(
      output.contents.map((content) => ({
        workspaceId: action.workspaceId,
        agentMCPActionId: action.id,
        content,
      }))
    );
  }

  // Specific handling for run_agent notifications indicating the tool has
  // started and can be resumed: the action is updated to save the resumeState.
  if (isRunAgentQueryProgressOutput(output)) {
    await action.updateStepContext({
      ...action.stepContext,
      resumeState: {
        userMessageId: output.userMessageId,
        conversationId: output.conversationId,
      },
    });
  }

  // Regular notifications, we yield them as is with the type "tool_notification".
  return {
    type: "tool_notification",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    action: {
      ...action.toJSON(),
      output: null,
      generatedFiles: [],
    },
    notification: notification.params,
  };
}

/**
 * Processes tool results, handles file uploads, and creates output items.
 * Returns the processed content and generated files.
 */
export async function processToolResults(
  auth: Authenticator,
  {
    action,
    conversation,
    localLogger,
    toolCallResultContent,
    toolConfiguration,
  }: {
    action: AgentMCPActionResource;
    conversation: ConversationType;
    localLogger: Logger;
    toolCallResultContent: CallToolResult["content"];
    toolConfiguration: LightMCPToolConfigurationType;
  }
): Promise<{
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
    toolCallResultContent,
    async (block) => {
      switch (block.type) {
        case "text": {
          // If the text is too large we create a file and return a resource block that references the file.
          if (
            computeTextByteSize(block.text) > MAX_TEXT_CONTENT_SIZE &&
            toolConfiguration.mcpServerName !== "conversation_files"
          ) {
            const fileName = `${toolConfiguration.mcpServerName}_${Date.now()}.txt`;
            const snippet =
              block.text.substring(0, MAXED_OUTPUT_FILE_SNIPPET_LENGTH) +
              "... (truncated)";

            const file = await generatePlainTextFile(auth, {
              title: fileName,
              conversationId: conversation.sId,
              content: block.text,
              snippet,
            });
            return {
              content: {
                type: "resource",
                resource: {
                  uri: file.getPublicUrl(auth),
                  mimeType: "text/plain",
                  text: block.text,
                },
              },
              file,
            };
          }
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
            // We need to create the conversation data source in case the file comes from a subagent
            // who uploaded it to its own conversation but not the main agent's.
            if (file) {
              await uploadFileToConversationDataSource({ auth, file });
            }
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
              const extension =
                extensionsForContentType(
                  block.resource.mimeType as SupportedFileContentType
                )[0] || "";
              const fileName = `${block.resource.uri}${extension}`;

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
            const text =
              "text" in block.resource &&
              typeof block.resource.text === "string"
                ? stripNullBytes(block.resource.text)
                : null;

            // If the resource text is too large, we create a file and return a resource block that references the file.
            if (text && computeTextByteSize(text) > MAX_RESOURCE_CONTENT_SIZE) {
              const fileName =
                block.resource.uri?.split("/").pop() ??
                `resource_${Date.now()}.txt`;
              const snippet =
                text.substring(0, MAXED_OUTPUT_FILE_SNIPPET_LENGTH) +
                "... (truncated)";

              const file = await generatePlainTextFile(auth, {
                title: fileName,
                conversationId: conversation.sId,
                content: text,
                snippet,
              });
              return {
                content: {
                  type: block.type,
                  resource: {
                    ...block.resource,
                    text: text,
                  },
                },
                file,
              };
            }
            return {
              content: {
                type: block.type,
                resource: {
                  ...block.resource,
                  ...(text ? { text } : {}),
                },
              },
              file: null,
            };
          }
        }
        case "resource_link": {
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
      workspaceId: action.workspaceId,
      agentMCPActionId: action.id,
      content: c.content,
      fileId: c.file?.id,
    }))
  );

  const generatedFiles: ActionGeneratedFileType[] = removeNulls(
    cleanContent.map((c) => {
      if (!c.file) {
        return null;
      }
      const isHidden =
        c.content.type === "resource" &&
        isToolGeneratedFile(c.content) &&
        c.content.resource.hidden === true;
      return {
        contentType: c.file.contentType,
        fileId: c.file.sId,
        snippet: c.file.snippet,
        title: c.file.fileName,
        ...(isHidden ? { hidden: true } : {}),
      } satisfies ActionGeneratedFileType;
    })
  );

  return { outputItems, generatedFiles };
}

/**
 * Helper function to augment inputs with configuration data.
 */
export function getAugmentedInputs(
  auth: Authenticator,
  {
    actionConfiguration,
    rawInputs,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    rawInputs: Record<string, unknown>;
  }
): Record<string, unknown> {
  return augmentInputsWithConfiguration({
    owner: auth.getNonNullableWorkspace(),
    rawInputs,
    actionConfiguration,
  });
}
