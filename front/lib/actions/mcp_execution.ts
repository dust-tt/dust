import { uploadFileToConversationDataSource } from "@app/lib/actions/action_file_helpers";
import { FILE_OFFLOAD_SNIPPET_LENGTH } from "@app/lib/actions/action_output_limits";
import type {
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
  isToolGeneratedFilePath,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { handleBase64Upload } from "@app/lib/actions/mcp_utils";
import type {
  ActionGeneratedFileType,
  ToolContextType,
  ToolOutputItemType,
} from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { isInternalServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { persistToolOutput } from "@app/lib/api/files/action_output_fs";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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
import assert from "assert";
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
    toolContext,
  }: {
    toolContext: ToolContextType;
  }
): Promise<{
  event: ToolNotificationEvent;
  outputItems: ToolOutputItemType[];
}> {
  const { runContext } = toolContext;
  assert(runContext, "processToolNotification requires a tool run context.");

  const output = notification.params._meta.data.output;

  let outputItems: ToolOutputItemType[] = [];

  // Handle store_resource notifications by creating output items immediately (fire-and-forget GCS).
  if (isStoreResourceProgressOutput(output)) {
    const outputRes = await runContext.action.createOutputItems(
      auth,
      output.contents.map((content) => ({
        content: sanitizeStringsDeep(content),
      }))
    );
    if (outputRes.isErr()) {
      throw outputRes.error;
    }
    outputItems = outputRes.value;
  }

  // Specific handling for run_agent notifications indicating the tool has
  // started and can be resumed: the action is updated to save the resumeState.
  // Sandbox function actions carry no step context to persist a resume state on, so this only
  // applies to agent loop run contexts.
  if (
    isRunAgentQueryProgressOutput(output) &&
    isAgentLoopRunContext(runContext)
  ) {
    await runContext.action.updateStepContext({
      ...runContext.action.stepContext,
      resumeState: {
        userMessageId: output.userMessageId,
        conversationId: output.conversationId,
      },
    });
  }

  // Regular notifications, we yield them as is with the type "tool_notification", scoped to the
  // run context they were emitted from.
  switch (runContext.contextType) {
    case "agent_loop":
      return {
        event: {
          type: "tool_notification",
          created: Date.now(),
          configurationId: runContext.agentConfiguration.sId,
          conversationId: runContext.conversation.sId,
          messageId: runContext.agentMessage.sId,
          action: {
            ...runContext.action.toJSON(),
            output: null,
            generatedFiles: [],
          },
          notification: notification.params,
        },
        outputItems,
      };
    case "sandbox_function":
      return {
        event: {
          type: "tool_notification",
          created: Date.now(),
          sandboxFunctionId: runContext.invocation.sandboxFunction.sId,
          invocationId: runContext.invocation.sId,
          action: runContext.action.toJSON(),
          notification: notification.params,
        },
        outputItems,
      };
    default:
      return assertNever(runContext);
  }
}

/**
 * Processes tool results, handles file uploads, and persists the output: one output item per
 * content block in an agent loop, a single GCS object holding the full content array for a
 * sandbox function invocation.
 * Returns the processed content and generated files.
 */
export async function processToolResults(
  auth: Authenticator,
  {
    localLogger,
    toolCallResultContent,
    toolContext,
  }: {
    localLogger: Logger;
    toolCallResultContent: CallToolResult["content"];
    toolContext: ToolContextType;
  }
): Promise<{
  outputItems: ToolOutputItemType[];
  generatedFiles: ActionGeneratedFileType[];
}> {
  const { runContext } = toolContext;
  assert(runContext, "processToolResults requires a tool run context.");
  const { toolConfiguration } = runContext;

  const timestamp = Date.now();
  const cleanContent: {
    content: CallToolResult["content"][number];
    file: FileResource | null;
  }[] = await concurrentExecutor(
    toolCallResultContent,
    async (block, idx) => {
      const res = await persistToolOutput(auth, toolContext, block, {
        toolName: toolConfiguration.name,
        serverName: toolConfiguration.mcpServerName,
      });
      if (res.isErr()) {
        return {
          content: {
            type: "text",
            text: "Failed to save the tool output.",
          },
          file: null,
        };
      }

      switch (block.type) {
        case "text": {
          // If persistToolOutput wrote this block to DustFileSystem (too large), return a resource
          // block pointing at the scoped path. The model reads it via the `cat` tool.
          if (res.value !== null) {
            const snippet =
              block.text.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH) +
              "... (truncated)";
            return {
              content: {
                type: "resource",
                resource: {
                  uri: res.value.scopedPath,
                  mimeType: "text/plain",
                  text: snippet,
                },
              },
              file: null,
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
            toolContext,
          });
        }

        case "audio": {
          return {
            content: block,
            file: null,
          };
        }

        case "resource": {
          // File path only, pass through as-is.
          if (isToolGeneratedFilePath(block)) {
            return {
              content: {
                type: block.type,
                resource: sanitizeStringsDeep(block.resource),
              },
              file: null,
            };
          }

          // File generated by the tool, already upserted.
          if (isToolGeneratedFile(block)) {
            // Retrieve the file for the FK in the AgentMCPActionOutputItem.
            const file = await FileResource.fetchById(
              auth,
              block.resource.fileId
            );
            const conversation = isAgentLoopRunContext(runContext)
              ? runContext.conversation
              : null;

            // We need to create the conversation data source in case the file comes from a subagent
            // who uploaded it to its own conversation but not the main agent's.
            // Skip for project_context files — they are already indexed via their own data source.
            // Skip outside of a conversation — there is no conversation data source to upsert to.
            if (file && file.useCase !== "project_context" && conversation) {
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
                fileName,
                toolContext,
              });
            }

            const fileName = isResourceWithName(block.resource)
              ? block.resource.name
              : (block.resource.uri.split("/").pop() ?? "generated-file");

            // Files land on the conversation in an agent loop, on the pod's shared project
            // context in a sandbox function invocation.
            let fileUseCase: FileUseCase;
            let fileUseCaseMetadata: FileUseCaseMetadata;
            switch (runContext.contextType) {
              case "agent_loop":
                fileUseCase = "conversation";
                fileUseCaseMetadata = {
                  conversationId: runContext.conversation.sId,
                };
                break;
              case "sandbox_function":
                fileUseCase = "project_context";
                fileUseCaseMetadata = {
                  spaceId: runContext.invocation.sandboxFunction.space.sId,
                };
                break;
              default:
                assertNever(runContext);
            }

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

            // Large resource text was already offloaded by persistToolOutput above.
            if (res.value !== null) {
              const snippet =
                text !== null
                  ? text.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH) +
                    "... (truncated)"
                  : "";
              return {
                content: {
                  type: block.type,
                  resource: {
                    ...sanitizedResource,
                    text: snippet,
                  },
                },
                file: null,
              };
            }

            localLogger.info(
              {
                mimeType: block.resource.mimeType ?? null,
                toolName: toolConfiguration.name,
                serverName: toolConfiguration.mcpServerName,
                blobBytes: isBlobResource(block)
                  ? Buffer.byteLength(block.resource.blob, "utf8")
                  : 0,
              },
              "MCP tool returned an embedded resource with an unsupported or missing mimeType; storing it inline in the conversation."
            );

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

  const generatedFiles: ActionGeneratedFileType[] = removeNulls(
    cleanContent.map((c) => {
      if (c.file) {
        return {
          contentType: c.file.contentType,
          fileId: c.file.sId,
          snippet: c.file.snippet,
          title: c.file.fileName,
          createdAt: c.file.createdAt.getTime(),
          updatedAt: c.file.updatedAt.getTime(),
          isInProjectContext: c.file.useCase === "project_context",
          hidden: c.file.useCaseMetadata?.hideFromUser ?? false,
          skipDataSourceIndexing:
            c.file.useCaseMetadata?.skipDataSourceIndexing ?? false,
        } satisfies ActionGeneratedFileType;
      }

      if (isToolGeneratedFilePath(c.content)) {
        return {
          fileId: null,
          filePath: c.content.resource.path,
          title: c.content.resource.title,
          contentType: c.content.resource.contentType,
          snippet: null,
          hidden: false,
        } satisfies ActionGeneratedFileType;
      }

      return null;
    })
  );

  // Persist the processed contents on the run context's action: per-item rows for agent loop
  // actions, a single output object for sandbox function actions.
  const outputRes = await runContext.action.createOutputItems(
    auth,
    cleanContent.map((c) => ({
      content: sanitizeStringsDeep(c.content),
      fileId: c.file?.id,
    }))
  );

  // Surfaced as an exception: there is no acceptable degraded state for unpersisted tool outputs.
  if (outputRes.isErr()) {
    throw outputRes.error;
  }

  return { outputItems: outputRes.value, generatedFiles };
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
  // Remote MCP tools pass inputSchema through as-is; only Dust internal tools
  // inject configured data sources, tables, etc. via augmentInputsWithConfiguration.
  if (!isInternalServerSideMCPToolConfiguration(actionConfiguration)) {
    return rawInputs;
  }

  return augmentInputsWithConfiguration({
    owner: auth.getNonNullableWorkspace(),
    rawInputs,
    actionConfiguration,
  });
}
