import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getProjectSpace,
  getWritableProjectContext,
  makeSuccessResponse,
  validateSourceFileForCopy,
  withErrorHandling,
} from "@app/lib/actions/mcp_internal_actions/servers/project_context_management/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { upsertProjectContextFile } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { SupportedFileContentType } from "@app/types";
import {
  Err,
  isAllSupportedFileContentType,
  isSupportedFileContentType,
  Ok,
} from "@app/types";

export const LIST_PROJECT_FILES_TOOL_NAME = "list_project_files";
export const ADD_PROJECT_FILE_TOOL_NAME = "add_project_file";
export const UPDATE_PROJECT_FILE_TOOL_NAME = "update_project_file";

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
 * Registers the list_project_files tool.
 */
export function registerListProjectFilesTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    LIST_PROJECT_FILES_TOOL_NAME,
    "List all files in the project context. Returns file metadata including names, IDs, and content types.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: LIST_PROJECT_FILES_TOOL_NAME,
        agentLoopContext,
      },
      async () => {
        return withErrorHandling(async () => {
          const contextRes = await getProjectSpace(auth, agentLoopContext);
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
      }
    )
  );
}

/**
 * Registers the add_project_file tool.
 */
export function registerAddProjectFileTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    ADD_PROJECT_FILE_TOOL_NAME,
    "Add a new file to the project context. The file will be available to all conversations in this project. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    {
      fileName: z.string().describe("Name of the file to add"),
      content: z
        .string()
        .optional()
        .describe(
          "Text content of the file (provide either this or sourceFileId)"
        ),
      sourceFileId: z
        .string()
        .optional()
        .describe(
          "ID of an existing file to copy content from (provide either this or content)"
        ),
      contentType: z
        .string()
        .optional()
        .describe(
          "MIME type (default: text/plain, or inherited from sourceFileId if provided)"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ADD_PROJECT_FILE_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return withErrorHandling(async () => {
          const contextRes = await getWritableProjectContext(
            auth,
            agentLoopContext
          );
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
                new MCPError(
                  `Failed to copy file: ${copyResult.error.message}`,
                  { tracked: false }
                )
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
      }
    )
  );
}

/**
 * Registers the update_project_file tool.
 */
export function registerUpdateProjectFileTool(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  server.tool(
    UPDATE_PROJECT_FILE_TOOL_NAME,
    "Update the content of an existing file in the project context. This replaces the entire file content. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    {
      fileId: z.string().describe("ID of the file to update"),
      content: z
        .string()
        .optional()
        .describe(
          "New text content for the file (provide either this or sourceFileId)"
        ),
      sourceFileId: z
        .string()
        .optional()
        .describe(
          "ID of an existing file to copy content from (provide either this or content)"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: UPDATE_PROJECT_FILE_TOOL_NAME,
        agentLoopContext,
      },
      async (params) => {
        return withErrorHandling(async () => {
          const contextRes = await getWritableProjectContext(
            auth,
            agentLoopContext
          );
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
      }
    )
  );
}

/**
 * Registers all file-related tools on the server.
 */
export function registerFileTools(
  server: McpServer,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): void {
  registerListProjectFilesTool(server, auth, agentLoopContext);
  registerAddProjectFileTool(server, auth, agentLoopContext);
  registerUpdateProjectFileTool(server, auth, agentLoopContext);
}
