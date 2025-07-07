import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { EditFileTool } from "../tools/editFile.js";
import { ExecuteCommandTool } from "../tools/executeCommand.js";
import { ReadFileTool } from "../tools/readFile.js";
import { SearchContentTool } from "../tools/searchContent.js";
import { SearchFilesTool } from "../tools/searchFiles.js";

// Add local development tools to the MCP server
export const useFileSystemServer = async (
  dustAPI: DustAPI,
  onServerIdReceived: (serverId: string) => void
) => {
  const server = new McpServer({
    name: "fs-cli",
    version: process.env.npm_package_version || "0.1.0",
  });

  // const listFilesTool = new ListFilesTool();
  const readFileTool = new ReadFileTool();
  const editFileTool = new EditFileTool();
  // const writeFileTool = new WriteFileTool();
  // const createDirectoryTool = new CreateDirectoryTool();
  // const deleteFileTool = new DeleteFileTool();
  const searchFilesTool = new SearchFilesTool();
  const searchContentTool = new SearchContentTool();
  // const getCurrentDirectoryTool = new GetCurrentDirectoryTool();
  const executeCommandTool = new ExecuteCommandTool();

  // File operations
  server.tool(
    readFileTool.name,
    readFileTool.description,
    readFileTool.inputSchema.shape,
    readFileTool.execute
  );

  server.tool(
    editFileTool.name,
    editFileTool.description,
    editFileTool.inputSchema.shape,
    editFileTool.execute
  );

  // Development utilities
  server.tool(
    searchFilesTool.name,
    searchFilesTool.description,
    searchFilesTool.inputSchema.shape,
    searchFilesTool.execute
  );

  server.tool(
    searchContentTool.name,
    searchContentTool.description,
    searchContentTool.inputSchema.shape,
    searchContentTool.execute
  );

  server.tool(
    executeCommandTool.name,
    executeCommandTool.description,
    executeCommandTool.inputSchema.shape,
    executeCommandTool.execute
  );

  // Connect to Dust with enhanced error handling
  const transport = new DustMcpServerTransport(
    dustAPI,
    (serverId) => {
      onServerIdReceived(serverId);
    },
    "fs-cli",
    true
  ); // Enable verbose logging

  // Add error handling for connection issues
  transport.onerror = (error) => {
    console.error("[MCP Transport Error]", error.message);
    if (error.message.includes("No activity within")) {
      console.error(
        "[MCP Transport] Connection timeout - this may indicate server-side issues"
      );
      console.error(
        "[MCP Transport] Consider checking network connectivity and server health"
      );
    }
  };

  try {
    await server.connect(transport);
  } catch (error) {
    console.error("[MCP Connection Failed]", error);
    throw new Error(
      `Failed to connect MCP server: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
