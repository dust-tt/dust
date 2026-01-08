import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  getAttachmentFromToolOutput,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { getProjectContextDataSourceView } from "@app/lib/api/assistant/jit/utils";
import { getOrCreateProjectContextDataSource } from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { FileUseCase, SupportedFileContentType } from "@app/types";
import {
  Err,
  isAllSupportedFileContentType,
  isSupportedFileContentType,
  Ok,
} from "@app/types";

const LIST_PROJECT_FILES_TOOL_NAME = "list_project_files";
const ADD_PROJECT_FILE_TOOL_NAME = "add_project_file";
const UPDATE_PROJECT_FILE_TOOL_NAME = "update_project_file";

// Use cases that are not allowed for copying.
const DISALLOWED_USE_CASES: FileUseCase[] = [
  "avatar",
  "upsert_document",
  "upsert_table",
  "folders_document",
];

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("project_context_management");

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
        const contextRes = await getConversationAndSpace(
          auth,
          agentLoopContext
        );
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        try {
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
        } catch (error) {
          return new Err(
            new MCPError(
              `Failed to list project files: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    )
  );

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
        const contextRes = await getConversationAndSpace(
          auth,
          agentLoopContext
        );
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { space } = contextRes.value;

        // Check write permissions.
        if (!space.canWrite(auth)) {
          return new Err(
            new MCPError("You do not have write permissions for this project", {
              tracked: false,
            })
          );
        }

        const { fileName, content, sourceFileId, contentType } = params;
        const owner = auth.getNonNullableWorkspace();
        const user = auth.getNonNullableUser();

        let file: FileResource;

        try {
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

            // Validate content type is supported (to get the right type on finalContentType)
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
                {
                  tracked: false,
                }
              )
            );
          }

          // Get or create project context datasource.
          const dataSourceRes = await getOrCreateProjectContextDataSource(
            auth,
            space
          );

          if (dataSourceRes.isErr()) {
            logger.error(
              {
                error: dataSourceRes.error,
                spaceId: space.sId,
              },
              "Failed to get/create project context datasource"
            );
            return new Err(
              new MCPError(
                `Failed to create project datasource: ${dataSourceRes.error.message}`
              )
            );
          }

          // Upsert to datasource
          const upsertRes = await processAndUpsertToDataSource(
            auth,
            dataSourceRes.value,
            { file }
          );

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
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  fileId: file.sId,
                  fileName: file.fileName,
                  message: `File "${fileName}" added to project context successfully.`,
                },
                null,
                2
              ),
            },
          ]);
        } catch (error) {
          return new Err(
            new MCPError(
              `Failed to add file: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    )
  );

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
        const contextRes = await getConversationAndSpace(
          auth,
          agentLoopContext
        );
        if (contextRes.isErr()) {
          return contextRes;
        }

        const { conversation, space } = contextRes.value;

        // Check write permissions.
        if (!space.canWrite(auth)) {
          return new Err(
            new MCPError("You do not have write permissions for this project", {
              tracked: false,
            })
          );
        }

        const { fileId, content, sourceFileId } = params;

        try {
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

            // Get file content from GCS.
            const owner = auth.getNonNullableWorkspace();
            const readStream = sourceFile.getSharedReadStream(
              owner,
              "original"
            );
            const chunks: Buffer[] = [];
            for await (const chunk of readStream) {
              chunks.push(chunk);
            }
            fileContent = Buffer.concat(chunks).toString("utf-8");

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
                {
                  tracked: false,
                }
              )
            );
          }

          // Upload new content.
          await file.uploadContent(auth, fileContent);

          // Re-upsert to datasource to update search index.
          const projectDataSourceView = await getProjectContextDataSourceView(
            auth,
            conversation
          );

          if (projectDataSourceView) {
            const dataSource = projectDataSourceView.dataSource;
            const upsertRes = await processAndUpsertToDataSource(
              auth,
              dataSource,
              { file }
            );

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
          }

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  fileId: file.sId,
                  fileName: file.fileName,
                  message: `File "${file.fileName}" updated successfully.`,
                },
                null,
                2
              ),
            },
          ]);
        } catch (error) {
          return new Err(
            new MCPError(
              `Failed to update file: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      }
    )
  );

  return server;
}

// Helper to get conversation and space.
const getConversationAndSpace = async (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
) => {
  if (!agentLoopContext?.runContext?.conversation) {
    return new Err(
      new MCPError("No conversation context available", { tracked: false })
    );
  }

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      agentLoopContext.runContext.conversation.sId
    );

  if (conversationRes.isErr()) {
    return new Err(
      new MCPError(`Conversation not found: ${conversationRes.error.message}`, {
        tracked: false,
      })
    );
  }

  const conversation = conversationRes.value;

  if (!conversation.spaceId) {
    return new Err(
      new MCPError(
        "This conversation is not in a project. Project context management is only available in project conversations.",
        { tracked: false }
      )
    );
  }

  const space = await SpaceResource.fetchById(auth, conversation.spaceId);
  if (!space) {
    return new Err(new MCPError("Project not found", { tracked: false }));
  }

  return new Ok({ conversation, space });
};

// Helper to validate if a file is Dust-generated content type.
// Accepts Dust-specific content types (vnd.dust.*)
function isDustContentType(contentType: string, useCase: FileUseCase): boolean {
  // Reject Dust-specific content types (includes vnd.dust.section.json,
  // vnd.dust.attachment.*, vnd.dust.frame, vnd.dust.tool-output.*).
  if (contentType.includes("vnd.dust.")) {
    return true;
  }

  // Reject disallowed use cases (avatar, etc.).
  if (DISALLOWED_USE_CASES.includes(useCase)) {
    return true;
  }

  return false;
}

// Helper to validate source file for copying.
async function validateSourceFileForCopy(
  auth: Authenticator,
  {
    sourceFileId,
    targetSpaceId,
  }: { sourceFileId: string; targetSpaceId: number }
) {
  const sourceFile = await FileResource.fetchById(auth, sourceFileId);
  if (!sourceFile) {
    return new Err(new MCPError("Source file not found", { tracked: false }));
  }

  if (!sourceFile.isReady) {
    return new Err(
      new MCPError(`Source file not ready: ${sourceFileId}`, {
        tracked: false,
      })
    );
  }

  if (!sourceFile.useCaseMetadata?.conversationId) {
    return new Err(
      new MCPError("Source file is not associated with a conversation", {
        tracked: false,
      })
    );
  }

  const sourceFileConversation = await ConversationResource.fetchById(
    auth,
    sourceFile.useCaseMetadata.conversationId
  );
  if (!sourceFileConversation) {
    return new Err(
      new MCPError("Source file's conversation not found", {
        tracked: false,
      })
    );
  }

  if (sourceFileConversation.spaceId !== targetSpaceId) {
    return new Err(
      new MCPError("Cannot copy files external to the project", {
        tracked: false,
      })
    );
  }

  if (isDustContentType(sourceFile.contentType, sourceFile.useCase)) {
    return new Err(
      new MCPError(
        "Only basic content types (txt, pdf, etc.) can be copied. Dust-generated files are not allowed.",
        { tracked: false }
      )
    );
  }

  return new Ok(sourceFile);
}

export default createServer;
