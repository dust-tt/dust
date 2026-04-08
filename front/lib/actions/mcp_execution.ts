import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import {
  computeTextByteSize,
  FILE_OFFLOAD_RESOURCE_SIZE_BYTES,
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
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
import { persistToolOutput } from "@app/lib/api/files/action_output_fs";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
} from "@app/types/files";
import {
  extensionsForContentType,
  isSupportedFileContentType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import {
  stripNullBytes,
  toWellFormed,
} from "@app/types/shared/utils/string_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { extname } from "path";
import type { Logger } from "pino";

/**
 * Recursively sanitizes all string values in an object by removing null bytes and lone surrogates.
 * This prevents PostgreSQL errors when storing JSON with \u0000 characters.
 */
function sanitizeStringsDeep<T>(input: T): T {
  if (typeof input === "string") {
    return toWellFormed(stripNullBytes(input)) as T;
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeStringsDeep) as T;
  }
  if (input !== null && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        sanitizeStringsDeep(value),
      ])
    ) as T;
  }
  return input;
}

export async function processToolNotification(
  auth: Authenticator,
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
  const output = notification.params._meta.data.output;

  // Handle store_resource notifications by creating output items immediately (fire-and-forget GCS).
  if (isStoreResourceProgressOutput(output)) {
    await action.createOutputItems(
      auth,
      output.contents.map((content) => ({
        content: sanitizeStringsDeep(content),
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
  outputItems: AgentMCPActionOutputItemModel[];
  generatedFiles: ActionGeneratedFileType[];
}> {
  const fileUseCase: FileUseCase = "conversation";
  const fileUseCaseMetadata: FileUseCaseMetadata = {
    conversationId: conversation.sId,
  };

  const timestamp = Date.now();
  const cleanContent: {
    content: CallToolResult["content"][number];
    file: FileResource | null;
  }[] = await concurrentExecutor(
    toolCallResultContent,
    async (block, idx) => {
      // Side effect: write qualifying blocks to tool_outputs/ in GCS.
      // TODO(2026-04-08: SANDBOX): Make this the default path.
      await persistToolOutput(auth, conversation, block, {
        toolName: toolConfiguration.mcpServerName,
      });

      switch (block.type) {
        case "text": {
          // If the text is too large we create a file and return a resource block that references the file.
          if (
            computeTextByteSize(block.text) > FILE_OFFLOAD_TEXT_SIZE_BYTES &&
            toolConfiguration.mcpServerName !== "conversation_files"
          ) {
            const fileName = `${toolConfiguration.mcpServerName}_${timestamp}_${idx}.txt`;
            const snippet =
              block.text.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH) +
              "... (truncated)";

            const file = await generatePlainTextFile(auth, {
              title: fileName,
              conversationId: conversation.sId,
              content: block.text,
              snippet,
              hideFromUser: true,
            });
            return {
              content: {
                type: "resource",
                resource: {
                  uri: file.getPublicUrl(auth),
                  mimeType: "text/plain",
                  text: snippet,
                },
              },
              file,
            };
          }
          return {
            content: {
              type: block.type,
              text: toWellFormed(stripNullBytes(block.text)),
            },
            file: null,
          };
        }
        case "image": {
          const fileName = isResourceWithName(block)
            ? block.name
            : `generated-image-${timestamp}_${idx}${extensionsForContentType(block.mimeType as any)[0]}`;

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
            // Skip for project_context files — they are already indexed via their own data source.
            if (file && file.useCase !== "project_context") {
              // Files uploaded by client-side tools (e.g. the Chrome extension) may not have a
              // conversationId in their metadata since the tool doesn't know it at upload time.
              // Patch it here so the JIT data source creation works correctly.
              if (
                file.useCase === "conversation" &&
                !file.useCaseMetadata?.conversationId
              ) {
                await file.setUseCaseMetadata(auth, {
                  conversationId: conversation.sId,
                });
              }
              await uploadFileToConversationDataSource({ auth, file });
            }
            return {
              content: {
                type: block.type,
                resource: {
                  ...block.resource,
                  text: toWellFormed(stripNullBytes(block.resource.text)),
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
              const extensionFromContentType =
                extensionsForContentType(
                  block.resource.mimeType as SupportedFileContentType
                )[0] || "";
              const extensionFromURI = extname(block.resource.uri);
              const fileName = extensionFromURI
                ? block.resource.uri
                : `${block.resource.uri}${extensionFromContentType}`;

              return handleBase64Upload(auth, {
                base64Data: block.resource.blob,
                mimeType: block.resource.mimeType,
                fileName: fileName,
                block,
                fileUseCase,
                fileUseCaseMetadata,
              });
            }

            const fileName = isResourceWithName(block.resource)
              ? block.resource.name
              : (block.resource.uri.split("/").pop() ?? "generated-file");

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
                ? toWellFormed(stripNullBytes(block.resource.text))
                : null;

            // Sanitize the entire resource object to remove null bytes from all string fields
            const sanitizedResource = sanitizeStringsDeep(block.resource);

            // If the resource text is too large, we create a file and return a resource block that references the file.
            if (
              text &&
              computeTextByteSize(text) > FILE_OFFLOAD_RESOURCE_SIZE_BYTES
            ) {
              const fileName =
                block.resource.uri?.split("/").pop() ??
                `resource_${Date.now()}.txt`;
              const snippet =
                text.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH) +
                "... (truncated)";

              const file = await generatePlainTextFile(auth, {
                title: fileName,
                conversationId: conversation.sId,
                content: text,
                snippet,
                hideFromUser: true,
              });
              return {
                content: {
                  type: block.type,
                  resource: {
                    ...sanitizedResource,
                    text: snippet,
                  },
                },
                file,
              };
            }
            return {
              content: {
                type: block.type,
                resource: {
                  ...sanitizedResource,
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

  const outputItems = await action.createOutputItems(
    auth,
    cleanContent.map((c) => ({
      content: sanitizeStringsDeep(c.content),
      fileId: c.file?.id,
    }))
  );

  const generatedFiles: ActionGeneratedFileType[] = removeNulls(
    cleanContent.map((c) => {
      if (!c.file) {
        return null;
      }

      return {
        contentType: c.file.contentType,
        fileId: c.file.sId,
        snippet: c.file.snippet,
        title: c.file.fileName,
        createdAt: c.file.createdAt.getTime(),
        updatedAt: c.file.updatedAt.getTime(),
        isInProjectContext: c.file.useCase === "project_context",
        hidden: c.file.useCaseMetadata?.hideFromUser ?? false,
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
