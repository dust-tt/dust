import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const serverInfo = {
  name: "memory",
  version: "1.0.0",
  description: "Saves and retrieves important information.",
  icon: "ActionBrainIcon",
  authorization: null,
  documentationUrl: null,
};

console.log("Creating memory server...");
const memoryStorage: { type: "text"; text: string }[] = []; // Static array to store memories

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "save_memory",
    "Save an important piece of information for later retrieval. " +
      "This can be used to remember key details, facts, or insights that may be useful " +
      "in future conversations or tasks. The memories can be retrieved later using the get_memories tool.",
    {
      memory: z
        .string()
        .max(4000)
        .describe(
          "The memory to save. This should be a concise and clear piece of information."
        ),
    },
    async ({ memory }) => {
      console.log("Saving memory:", memory);
      memoryStorage.push({ type: "text", text: memory });
      return {
        isError: false,
        content: [],
      };
    }
  );

  server.tool(
    "get_memories",
    "Retrieve all saved memories. This should be called at the beginning of each conversation to provide context",
    {},
    async () => {
      console.log("Retrieving memories:", memoryStorage);
      return {
        isError: false,
        content: memoryStorage,
      };
    }
  );

  server.tool(
    "forget_memories",
    "Erase all saved memories. This can be used to clear the memory storage when the information is no longer needed.",
    {},
    async () => {
      console.log("Forgetting all memories");
      memoryStorage.length = 0; // Clear the memory storage
      return {
        isError: false,
        content: [],
      };
    }
  );

  return server;
};

export default createServer;
