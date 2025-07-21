import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { EditFileTool } from "../tools/editFile.js";
import { ReadFileTool } from "../tools/readFile.js";
import { RunCommandTool } from "../tools/runCommand.js";
import { SearchContentTool } from "../tools/searchContent.js";
import { SearchFilesTool } from "../tools/searchFiles.js";

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
  const runCommandTool = new RunCommandTool();

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

  server.tool(
    runCommandTool.name,
    runCommandTool.description,
    runCommandTool.inputSchema.shape,
    runCommandTool.execute.bind(runCommandTool)
  );

  // Connect to Dust with enhanced error handling
  const transport = new DustMcpServerTransport(
    dustAPI,
    (serverId) => {
      onServerIdReceived(serverId);
    },
    "fs-cli",
    false,
    365 * 24 * 60 * 60 * 1000
    // TODO: This is kind of a hack that is ok for now,
    // the reason we need this is because we have yaffle's event source polyfill,
    // which doesnt allow us to turn off timeouts, so we would need to continuously
    // send keep alive messages from server, but there is currently an
    // optimization to stop those messages from sever when mcp tools are not being used.
  );

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
