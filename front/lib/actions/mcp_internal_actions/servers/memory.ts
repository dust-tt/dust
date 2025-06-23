import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { ConversationType} from "@app/types";
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

function getMemoryFileName(conversation: ConversationType) {
  return `memories_${conversation.sId}`;
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
    "initialize",
    "Create new memories with specified content.",
    {
      content: z.string().describe("Initial content to store."),
    },
    async ({ content }) => {
      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      const owner = auth.getNonNullableWorkspace();

      const fileName = getMemoryFileName(
        agentLoopContext.runContext.conversation
      );
      const file = await FileResource.makeNew({
        workspaceId: owner.id,
        contentType: "text/plain",
        fileName,
        fileSize: Buffer.byteLength(content, "utf8"),
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: agentLoopContext.runContext.conversation.sId,
        },
      });

      try {
        await writeFileContent(file, auth, content);
      } catch (error) {
        return makeMCPToolTextError(
          `Failed to create memory file: ${normalizeError(error).message}`
        );
      }
      await file.markAsReady();

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: "Successfully put the input content in the conversation memories.",
          },
        ],
      };
    }
  );

  server.tool(
    "read",
    "Read the contents of an existing memory file by ID or name",
    {
    },
    async () => {
      try {

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
    "clear_memories",
    "Delete the memory file for the current conversation.",
    {},
    async () => {
      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      try {
        const fileResource = await FileResource.fetchById(
          auth,
          agentLoopContext.runContext.conversation.sId
        );

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
