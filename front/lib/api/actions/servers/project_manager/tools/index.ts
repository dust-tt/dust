// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getProjectSpace,
  getWritableProjectContext,
  makeSuccessResponse,
  validateSourceFileForCopy,
  withErrorHandling,
} from "@app/lib/api/actions/servers/project_manager/helpers";
import { PROJECT_MANAGER_TOOLS_METADATA } from "@app/lib/api/actions/servers/project_manager/metadata";
import { formatConversationsForDisplay } from "@app/lib/api/actions/servers/project_manager/tools/conversation_formatting";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import { upsertProjectContextFile } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getProjectRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import type { SupportedFileContentType } from "@app/types/files";
import {
  isAllSupportedFileContentType,
  isSupportedFileContentType,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * Reads content from a source file.
 */
async function readSourceFileContent(
  auth: Authenticator,
  sourceFile: FileResource
): Promise<string> {
  const owner = auth.getNonNullableWorkspace();
  const readStream = sourceFile.getSharedReadStream(owner, "original");
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function createProjectManagerTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof PROJECT_MANAGER_TOOLS_METADATA> = {
    list_files: async ({ dustProject }) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        const files = await FileResource.listByProject(auth, {
          projectId: space.sId,
        });

        // Filter files to only those with supported content types.
        // TypeScript doesn't narrow the type through filter, so we assert it.
        const supportedFiles = files.filter((file) =>
          isSupportedFileContentType(file.contentType)
        ) as Array<FileResource & { contentType: SupportedFileContentType }>;

        if (files.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No files are currently in the project context.",
            },
          ]);
        }

        const attachments = supportedFiles.map((file) =>
          getAttachmentFromToolOutput({
            fileId: file.sId,
            contentType: file.contentType,
            title: file.fileName,
            snippet: null,
          })
        );

        let content = `The following files are currently in the project context:\n`;
        for (const [i, attachment] of attachments.entries()) {
          if (i > 0) {
            content += "\n";
          }
          content += renderAttachmentXml({ attachment });
        }

        return new Ok([
          {
            type: "text" as const,
            text: content,
          },
        ]);
      }, "Failed to list project files");
    },

    add_file: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileName, content, sourceFileId, contentType } = params;
        const owner = auth.getNonNullableWorkspace();
        const user = auth.getNonNullableUser();

        let file: FileResource;

        // If sourceFileId is provided, use the copy method.
        if (sourceFileId) {
          const sourceFileRes = await validateSourceFileForCopy(auth, {
            sourceFileId,
            targetSpaceId: space.id,
          });
          if (sourceFileRes.isErr()) {
            return sourceFileRes;
          }

          const copyResult = await FileResource.copy(auth, {
            sourceId: sourceFileId,
            useCase: "project_context",
            useCaseMetadata: { spaceId: space.sId },
          });

          if (copyResult.isErr()) {
            return new Err(
              new MCPError(`Failed to copy file: ${copyResult.error.message}`, {
                tracked: false,
              })
            );
          }

          file = copyResult.value;

          // Rename if a different fileName was provided.
          if (fileName !== file.fileName) {
            await file.rename(fileName);
          }
        } else if (content) {
          // Create file from direct content.
          const finalContentType = contentType ?? "text/plain";

          // Validate content type is text-based.
          if (!finalContentType.startsWith("text/")) {
            return new Err(
              new MCPError(
                `Only text-based content types are supported. Got: ${finalContentType}`,
                { tracked: false }
              )
            );
          }

          // Validate content type is supported.
          if (!isAllSupportedFileContentType(finalContentType)) {
            return new Err(
              new MCPError(`Unsupported content type: ${finalContentType}`, {
                tracked: false,
              })
            );
          }

          // Create file resource.
          file = await FileResource.makeNew({
            workspaceId: owner.id,
            userId: user.id,
            contentType: finalContentType,
            fileName,
            fileSize: Buffer.byteLength(content, "utf-8"),
            useCase: "project_context",
            useCaseMetadata: { spaceId: space.sId },
          });

          // Upload content to GCS.
          await file.uploadContent(auth, content);
        } else {
          return new Err(
            new MCPError(
              "Either 'content' or 'sourceFileId' must be provided",
              { tracked: false }
            )
          );
        }

        const upsertRes = await upsertProjectContextFile(auth, file);

        if (upsertRes.isErr()) {
          logger.error(
            {
              error: upsertRes.error,
              fileId: file.sId,
            },
            "Failed to upsert file to datasource"
          );
          // Don't fail - file is uploaded, just not indexed yet.
        }

        return new Ok([
          ...makeSuccessResponse({
            success: true,
            fileId: file.sId,
            fileName: file.fileName,
            message: `File "${fileName}" added to project context successfully.`,
          }),
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: file.getPublicUrl(auth),
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: null,
              text: `File "${file.fileName}" added to project context.`,
            },
          },
        ]);
      }, "Failed to add file");
    },

    update_file: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { fileId, content, sourceFileId } = params;

        // Fetch file.
        const file = await FileResource.fetchById(auth, fileId);
        if (!file) {
          return new Err(
            new MCPError(`File not found: ${fileId}`, { tracked: false })
          );
        }

        // Verify it's a project context file for this space.
        const metadata = file.useCaseMetadata as { spaceId?: string };
        if (
          file.useCase !== "project_context" ||
          metadata?.spaceId !== space.sId
        ) {
          return new Err(
            new MCPError("File not found in this project context", {
              tracked: false,
            })
          );
        }

        // Get file content from either direct content or source file.
        let fileContent: string;

        if (sourceFileId) {
          const sourceFileRes = await validateSourceFileForCopy(auth, {
            sourceFileId,
            targetSpaceId: space.id,
          });
          if (sourceFileRes.isErr()) {
            return sourceFileRes;
          }

          const sourceFile = sourceFileRes.value;
          fileContent = await readSourceFileContent(auth, sourceFile);

          if (!fileContent) {
            return new Err(
              new MCPError(
                `Failed to read content from source file: ${sourceFileId}`,
                { tracked: false }
              )
            );
          }
        } else if (content) {
          fileContent = content;
        } else {
          return new Err(
            new MCPError(
              "Either 'content' or 'sourceFileId' must be provided",
              { tracked: false }
            )
          );
        }

        // Upload new content.
        await file.uploadContent(auth, fileContent);

        // Re-upsert to datasource to update search index.
        const upsertRes = await upsertProjectContextFile(auth, file);

        if (upsertRes.isErr()) {
          logger.error(
            {
              error: upsertRes.error,
              fileId: file.sId,
            },
            "Failed to re-index updated file"
          );
          // Don't fail - content is updated, just not re-indexed.
        }

        return new Ok([
          ...makeSuccessResponse({
            success: true,
            fileId: file.sId,
            fileName: file.fileName,
            message: `File "${file.fileName}" updated successfully.`,
          }),
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: file.getPublicUrl(auth),
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: null,
              text: `File "${file.fileName}" updated in project context.`,
            },
          },
        ]);
      }, "Failed to update file");
    },

    edit_description: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { description } = params;

        // Fetch or create project metadata.
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );

        if (!metadata) {
          // Create metadata if it doesn't exist.
          await ProjectMetadataResource.makeNew(auth, space, {
            description,
          });
        } else {
          // Update existing metadata.
          const updateRes = await metadata.updateMetadata({ description });
          if (updateRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to update project description: ${updateRes.error.message}`,
                { tracked: false }
              )
            );
          }
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            description,
            message: "Project description updated successfully.",
          })
        );
      }, "Failed to edit project description");
    },

    get_information: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const owner = auth.getNonNullableWorkspace();

        // Fetch project metadata
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );

        // Fetch files
        const files = await FileResource.listByProject(auth, {
          projectId: space.sId,
        });

        const fileList = files
          .filter((file) => isSupportedFileContentType(file.contentType))
          .map((file) => ({
            fileId: file.sId,
            fileName: file.fileName,
            contentType: file.contentType,
          }));

        // Construct project URL
        const projectPath = getProjectRoute(owner.sId, space.sId);
        const projectUrl = `${config.getAppUrl()}${projectPath}`;

        return new Ok(
          makeSuccessResponse({
            success: true,
            project: {
              spaceId: space.sId,
              name: space.name,
              url: projectUrl,
              description: metadata?.description ?? null,
              fileCount: files.length,
              files: fileList,
            },
            message: "Successfully retrieved project information",
          })
        );
      }, "Failed to get project information");
    },

    search_unread: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { daysBack = 30, limit = 20 } = params;

        // Calculate the cutoff date for the time window
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);

        // List conversations in the project space updated since cutoff
        const spaceConversations =
          await ConversationResource.listConversationsInSpace(auth, {
            spaceId: space.sId,
            options: {
              updatedSince: cutoffDate.getTime(),
            },
          });

        // Fetch full conversations with content
        const conversationResults = await concurrentExecutor(
          spaceConversations,
          async (c) => getConversation(auth, c.sId, false),
          { concurrency: 10 }
        );

        // Extract successful conversations
        const conversationsFull = conversationResults
          .filter((r) => r.isOk())
          .map((r) => r.value);

        // Filter for unread conversations based on the unread flag, and apply limit
        const unreadConversations = conversationsFull.filter((c) => c.unread);

        // Apply limit
        const limitedConversations = unreadConversations.slice(0, limit);

        if (limitedConversations.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `No unread conversations found in project "${space.name}" from the last ${daysBack} days.`,
            },
          ]);
        }

        const formattedConversations = formatConversationsForDisplay(
          limitedConversations,
          auth.getNonNullableWorkspace().sId
        );

        return new Ok(
          makeSuccessResponse({
            success: true,
            count: limitedConversations.length,
            total: unreadConversations.length,
            daysBack,
            conversations: formattedConversations,
            message: `Found ${limitedConversations.length} unread conversation(s) in project "${space.name}"${unreadConversations.length > limit ? ` (showing first ${limit} of ${unreadConversations.length})` : ""}.`,
          })
        );
      }, "Failed to search unread conversations");
    },
  };

  return buildTools(PROJECT_MANAGER_TOOLS_METADATA, handlers);
}
