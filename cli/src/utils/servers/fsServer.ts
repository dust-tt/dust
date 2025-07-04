import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";

import { normalizeError } from "../errors.js";
import { DustAPI, DustMcpServerTransport } from "@dust-tt/client";
import { ListFilesTool } from "../tools/listFiles.js";
import { ReadFileTool } from "../tools/readFile.js";
import { WriteFileTool } from "../tools/writeFile.js";
import { CreateDirectoryTool } from "../tools/createDirectory.js";
import { DeleteFileTool } from "../tools/deleteFile.js";
import { SearchFilesTool } from "../tools/searchFiles.js";
import { SearchContentTool } from "../tools/searchContent.js";
import { GetCurrentDirectoryTool } from "../tools/getCurrentDirectory.js";
import { ExecuteCommandTool } from "../tools/executeCommand.js";

// Add local development tools to the MCP server
export const useFileSystemServer = async (
  dustAPI: DustAPI,
  onServerIdReceived: (serverId: string) => void
) => {
  const server = new McpServer({
    name: "fs-cli",
    version: process.env.npm_package_version || "0.1.0",
  });

  const listFilesTool = new ListFilesTool();
  const readFileTool = new ReadFileTool();
  const writeFileTool = new WriteFileTool();
  const createDirectoryTool = new CreateDirectoryTool();
  const deleteFileTool = new DeleteFileTool();
  const searchFilesTool = new SearchFilesTool();
  const searchContentTool = new SearchContentTool();
  const getCurrentDirectoryTool = new GetCurrentDirectoryTool();
  const executeCommandTool = new ExecuteCommandTool();

  // File operations
  server.tool(
    listFilesTool.name,
    listFilesTool.description,
    listFilesTool.inputSchema.shape,
    listFilesTool.execute
  );

  server.tool(
    readFileTool.name,
    readFileTool.description,
    readFileTool.inputSchema.shape,
    readFileTool.execute
  );

  server.tool(
    writeFileTool.name,
    writeFileTool.description,
    writeFileTool.inputSchema.shape,
    writeFileTool.execute
  );

  server.tool(
    createDirectoryTool.name,
    createDirectoryTool.description,
    createDirectoryTool.inputSchema.shape,
    createDirectoryTool.execute
  );

  server.tool(
    deleteFileTool.name,
    deleteFileTool.description,
    deleteFileTool.inputSchema.shape,
    deleteFileTool.execute
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
    getCurrentDirectoryTool.name,
    getCurrentDirectoryTool.description,
    getCurrentDirectoryTool.inputSchema.shape,
    getCurrentDirectoryTool.execute
  );

  server.tool(
    executeCommandTool.name,
    executeCommandTool.description,
    executeCommandTool.inputSchema.shape,
    executeCommandTool.execute
  );

  // Connect to Dust.
  const transport = new DustMcpServerTransport(dustAPI, (serverId) => {
    onServerIdReceived(serverId);
  });
  await server.connect(transport);
};
