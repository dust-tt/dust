import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ReadFileTool } from "../tools/readFile.js";
import { SearchContentTool } from "../tools/searchContent.js";
import { SearchFilesTool } from "../tools/searchFiles.js";
import { EditFileTool } from "../tools/editFile.js";

// Add local development tools to the MCP server
export const useFileSystemServer = async (
  dustAPI: DustAPI,
  onServerIdReceived: (serverId: string) => void,
  diffApprovalCallback?: (
    originalContent: string,
    updatedContent: string,
    filePath: string
  ) => Promise<boolean>
) => {
  const server = new McpServer({
    name: "fs-cli",
    version: process.env.npm_package_version || "0.1.0",
  });

  const readFileTool = new ReadFileTool();
  const searchFilesTool = new SearchFilesTool();
  const searchContentTool = new SearchContentTool();
  const editFileTool = new EditFileTool();

  if (diffApprovalCallback) {
    editFileTool.setDiffApprovalCallback(diffApprovalCallback);
  }

  // File operations
  server.tool(
    readFileTool.name,
    readFileTool.description,
    readFileTool.inputSchema.shape,
    readFileTool.execute.bind(readFileTool)
  );

  // Development utilities
  server.tool(
    searchFilesTool.name,
    searchFilesTool.description,
    searchFilesTool.inputSchema.shape,
    searchFilesTool.execute.bind(searchFilesTool)
  );

  server.tool(
    searchContentTool.name,
    searchContentTool.description,
    searchContentTool.inputSchema.shape,
    searchContentTool.execute.bind(searchContentTool)
  );

  server.tool(
    editFileTool.name,
    editFileTool.description,
    editFileTool.inputSchema.shape,
    editFileTool.execute.bind(editFileTool)
  );

  // Connect to Dust with enhanced error handling
  const transport = new DustMcpServerTransport(
    dustAPI,
    (serverId) => {
      onServerIdReceived(serverId);
    },
    "fs-cli"
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
