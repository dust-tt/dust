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
} from "@app/lib/api/actions/servers/project_context_management/helpers";
import { PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA } from "@app/lib/api/actions/servers/project_context_management/metadata";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { upsertProjectContextFile } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectJournalEntryResource } from "@app/lib/resources/project_journal_entry_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { SupportedFileContentType } from "@app/types";
import {
  Err,
  isAllSupportedFileContentType,
  isSupportedFileContentType,
  Ok,
} from "@app/types";

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

/**
 * Gets or creates project metadata for a space.
 */
async function getOrCreateProjectMetadata(
  auth: Authenticator,
  space: SpaceResource,
  initialData: {
    description?: string | null;
    urls?: { name: string; url: string }[];
  }
): Promise<ProjectMetadataResource> {
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

  if (metadata) {
    return metadata;
  }

  return ProjectMetadataResource.makeNew(auth, space, {
    description: initialData.description ?? null,
    urls: initialData.urls ?? [],
  });
}

export function createProjectContextManagementTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<
    typeof PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA
  > = {
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

        return new Ok(
          makeSuccessResponse({
            success: true,
            fileId: file.sId,
            fileName: file.fileName,
            message: `File "${fileName}" added to project context successfully.`,
          })
        );
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

        return new Ok(
          makeSuccessResponse({
            success: true,
            fileId: file.sId,
            fileName: file.fileName,
            message: `File "${file.fileName}" updated successfully.`,
          })
        );
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
            urls: [],
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

    add_url: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { name, url } = params;

        // Fetch or create project metadata.
        const metadata = await getOrCreateProjectMetadata(auth, space, {
          urls: [{ name, url }],
        });

        // If metadata was just created, the URL is already added.
        // Otherwise, add the URL to existing URLs.
        if (metadata.urls.length === 0 || metadata.urls[0].name !== name) {
          const updatedUrls = [...metadata.urls, { name, url }];
          const updateRes = await metadata.updateMetadata({
            urls: updatedUrls,
          });
          if (updateRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to add project URL: ${updateRes.error.message}`,
                { tracked: false }
              )
            );
          }
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            name,
            url,
            message: `URL "${name}" added to project successfully.`,
          })
        );
      }, "Failed to add project URL");
    },

    edit_url: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getWritableProjectContext(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { currentName, newName, newUrl } = params;

        // Validate at least one field is being updated.
        if (!newName && !newUrl) {
          return new Err(
            new MCPError("At least one of newName or newUrl must be provided", {
              tracked: false,
            })
          );
        }

        // Fetch project metadata.
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );

        if (!metadata) {
          return new Err(
            new MCPError("No project metadata found", { tracked: false })
          );
        }

        // Find the URL to edit.
        const existingUrls = metadata.urls;
        const urlIndex = existingUrls.findIndex(
          (item) => item.name === currentName
        );

        if (urlIndex === -1) {
          return new Err(
            new MCPError(`URL with name "${currentName}" not found`, {
              tracked: false,
            })
          );
        }

        // Update the URL without mutating the original array.
        const updatedUrls = existingUrls.map((item, index) =>
          index === urlIndex
            ? {
                name: newName ?? item.name,
                url: newUrl ?? item.url,
              }
            : item
        );

        const updateRes = await metadata.updateMetadata({
          urls: updatedUrls,
        });
        if (updateRes.isErr()) {
          return new Err(
            new MCPError(
              `Failed to edit project URL: ${updateRes.error.message}`,
              { tracked: false }
            )
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            oldName: currentName,
            newName: newName ?? currentName,
            newUrl: newUrl ?? "unchanged",
            message: `URL "${currentName}" updated successfully.`,
          })
        );
      }, "Failed to edit project URL");
    },

    read_journal_entry: async (params) => {
      return withErrorHandling(async () => {
        const contextRes = await getProjectSpace(auth, {
          agentLoopContext,
          dustProject: params.dustProject,
        });
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;
        const { limit = 10 } = params;

        const entries = await ProjectJournalEntryResource.fetchBySpace(
          auth,
          space.id,
          { limit }
        );

        if (entries.length === 0) {
          return new Ok(
            makeSuccessResponse({
              success: true,
              entries: [],
              count: 0,
              message: "No journal entries exist for this project",
            })
          );
        }

        return new Ok(
          makeSuccessResponse({
            success: true,
            entries: entries.map((entry) => ({
              journalEntry: entry.journalEntry,
              createdAt: entry.createdAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
            })),
            count: entries.length,
            message: `Successfully retrieved ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"}`,
          })
        );
      }, "Failed to read project journal entries");
    },
  };

  return buildTools(PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA, handlers);
}
