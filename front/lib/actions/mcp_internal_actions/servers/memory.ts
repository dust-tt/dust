import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { normalizeError } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "memory",
  version: "1.0.0",
  description:
    "Agent memory management and file operations for persistent data storage",
  icon: "ActionBrainIcon",
  authorization: null,
  documentationUrl: null,
};

function validateContext(agentLoopContext?: AgentLoopContextType) {
  if (!agentLoopContext?.runContext) {
    throw new Error("No conversation context available");
  }
  return agentLoopContext.runContext;
}

function validateMemoryFile(
  fileResource: FileResource | null,
  conversationId: string
): FileResource {
  if (!fileResource) {
    throw new Error("Memory file not found");
  }

  const metadata = fileResource.useCaseMetadata;

  if (
    metadata?.type !== "memory_file" ||
    metadata?.conversationId !== conversationId
  ) {
    throw new Error("File is not a memory file for this conversation");
  }

  return fileResource;
}

async function writeFileContent(
  fileResource: FileResource,
  auth: Authenticator,
  content: string
) {
  const writeStream = fileResource.getWriteStream({
    auth,
    version: "original",
    overrideContentType: "text/plain",
  });

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    writeStream.write(content);
    writeStream.end();
  });

  await fileResource.setFileSize(Buffer.byteLength(content, "utf8"));
}

async function readFileContent(
  fileResource: FileResource,
  auth: Authenticator
): Promise<string> {
  const readStream = fileResource.getReadStream({
    auth,
    version: "original",
  });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    readStream.on("data", (chunk) => chunks.push(chunk));
    readStream.on("end", resolve);
    readStream.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "create_memory_file",
    "Create a new memory file with specified content",
    {
      fileName: z.string().describe("Name of the memory file"),
      content: z.string().describe("Initial content to store"),
      description: z.string().optional().describe("Optional description"),
    },
    async ({ fileName, content, description }) => {
      try {
        const runContext = validateContext(agentLoopContext);
        const owner = auth.getNonNullableWorkspace();

        const fileResource = await FileResource.makeNew({
          workspaceId: owner.id,
          contentType: "text/plain",
          fileName,
          fileSize: Buffer.byteLength(content, "utf8"),
          useCase: "conversation",
          useCaseMetadata: {
            conversationId: runContext.conversation.sId,
            agentMessageId: runContext.agentMessage.sId,
            type: "memory_file",
            description: description || `Memory file: ${fileName}`,
          },
        });

        await writeFileContent(fileResource, auth, content);
        await fileResource.markAsReady();

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Memory file '${fileName}' created successfully with ID: ${fileResource.sId}`,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to create memory file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "read_memory_file",
    "Read the contents of an existing memory file by ID or name",
    {
      fileId: z.string().optional().describe("ID of the memory file"),
      fileName: z.string().optional().describe("Name of the memory file"),
    },
    async ({ fileId, fileName }) => {
      try {
        const runContext = validateContext(agentLoopContext);

        if (!fileId && !fileName) {
          return makeMCPToolTextError(
            "Either fileId or fileName must be provided"
          );
        }

        let fileResource: FileResource | null = null;

        if (fileId) {
          fileResource = await FileResource.fetchById(auth, fileId);
        } else if (fileName) {
          const memoryFiles =
            await FileResource.fetchMemoryFilesByConversationId(
              auth,
              runContext.conversation.sId
            );
          fileResource =
            memoryFiles.find((file) => file.fileName === fileName) || null;
        }

        const validatedFile = validateMemoryFile(
          fileResource,
          runContext.conversation.sId
        );

        if (!validatedFile.isReady) {
          return makeMCPToolTextError("Memory file is not ready for reading");
        }

        const content = await readFileContent(validatedFile, auth);

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to read memory file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "write_memory_file",
    "Write new content to an existing memory file, replacing current content",
    {
      fileId: z.string().describe("ID of the memory file to write to"),
      content: z.string().describe("New content to write"),
    },
    async ({ fileId, content }) => {
      try {
        const runContext = validateContext(agentLoopContext);
        const fileResource = await FileResource.fetchById(auth, fileId);

        const validatedFile = validateMemoryFile(
          fileResource,
          runContext.conversation.sId
        );
        await writeFileContent(validatedFile, auth, content);

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Memory file '${validatedFile.fileName}' updated successfully`,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to write memory file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "append_memory_file",
    "Append content to an existing memory file",
    {
      fileId: z.string().describe("ID of the memory file to append to"),
      content: z.string().describe("Content to append"),
      separator: z
        .string()
        .optional()
        .describe("Separator before new content (default: '\\n')"),
    },
    async ({ fileId, content, separator = "\n" }) => {
      try {
        const runContext = validateContext(agentLoopContext);
        const fileResource = await FileResource.fetchById(auth, fileId);

        const validatedFile = validateMemoryFile(
          fileResource,
          runContext.conversation.sId
        );

        if (!validatedFile.isReady) {
          return makeMCPToolTextError("Memory file is not ready for appending");
        }

        const currentContent = await readFileContent(validatedFile, auth);
        const newContent = currentContent + separator + content;
        await writeFileContent(validatedFile, auth, newContent);

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Content appended to memory file '${validatedFile.fileName}' successfully`,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to append to memory file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  server.tool(
    "list_memory_files",
    "List all memory files in the current conversation",
    {},
    async () => {
      try {
        const runContext = validateContext(agentLoopContext);
        const memoryFiles = await FileResource.fetchMemoryFilesByConversationId(
          auth,
          runContext.conversation.sId
        );

        if (memoryFiles.length === 0) {
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: "No memory files found in this conversation.",
              },
            ],
          };
        }

        const fileList = memoryFiles
          .map((file) => {
            const metadata = file.useCaseMetadata;
            const description = metadata?.description || "No description";
            const createdAt = new Date(file.createdAt).toISOString();
            return `- ${file.fileName} (ID: ${file.sId}) - ${description} - Created: ${createdAt}`;
          })
          .join("\n");

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Memory files in this conversation:\n${fileList}`,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to list memory files: ${normalizeError(error).message}`
        );
      }
    }
  );

  server.tool(
    "clear_memory_file",
    "Delete a memory file by its ID",
    {
      fileId: z.string().describe("ID of the memory file to delete"),
    },
    async ({ fileId }) => {
      try {
        const runContext = validateContext(agentLoopContext);
        const fileResource = await FileResource.fetchById(auth, fileId);

        const validatedFile = validateMemoryFile(
          fileResource,
          runContext.conversation.sId
        );
        const fileName = validatedFile.fileName;

        const deleteResult = await validatedFile.delete(auth);

        if (deleteResult.isErr()) {
          return makeMCPToolTextError(
            `Failed to delete memory file: ${deleteResult.error.message}`
          );
        }

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Memory file '${fileName}' deleted successfully`,
            },
          ],
        };
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to delete memory file: ${normalizeError(error).message}`
        );
      }
    }
  );

  return server;
}

export default createServer;
