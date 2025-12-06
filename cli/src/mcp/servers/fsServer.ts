import type { DustAPI, Result } from "@dust-tt/client";
import { DustMcpServerTransport, Err, Ok } from "@dust-tt/client";
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
): Promise<Result<void, Error>> => {
  // Check if using API key authentication - MCP servers require OAuth
  const apiKey = await dustAPI.getApiKey();
  if (apiKey?.startsWith("sk-")) {
    return new Err(
      new Error(
        "File system access requires OAuth authentication. API keys don't support MCP server registration. Please use 'dust login' to authenticate with OAuth for file system features."
      )
    );
  }

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
    3 * 60 * 1000 // 3 minutes
  );

  try {
    await server.connect(transport);
    return new Ok(undefined);
  } catch (error) {
    console.error("[MCP Connection Failed]", error);
    return new Err(
      new Error(
        `Failed to connect MCP server: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
  }
};
