import type { DustAPI, Result } from "@dust-tt/client";
import { DustMcpServerTransport, Err, Ok } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { CLI_VERSION } from "../../utils/version.js";
import { EditFileTool } from "../tools/editFile.js";
import { ListDirectoryTool } from "../tools/listDirectory.js";
import { ReadFileTool } from "../tools/readFile.js";
import { RunCommandTool } from "../tools/runCommand.js";
import { SearchContentTool } from "../tools/searchContent.js";
import { SearchFilesTool } from "../tools/searchFiles.js";
import { WriteFileTool } from "../tools/writeFile.js";

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

  const server = new McpServer(
    {
      name: "fs-cli",
      version: CLI_VERSION,
    },
    {
      instructions: [
        "You have access to the user's local filesystem. Follow these guidelines:",
        "",
        "EXPLORATION: Start with list_directory to understand project structure before diving into files.",
        "READING: read_file returns line-numbered output. Use offset/limit to paginate large files.",
        "SEARCHING: Use search_files for finding files by name/pattern. Use search_content for finding text within files — use context_lines to see surrounding code.",
        "EDITING: Always read_file before edit_file. The old_string must match the file content exactly including whitespace. Use line numbers from read_file to locate the right section.",
        "WRITING: Use write_file to create new files. For modifying existing files, prefer edit_file for targeted changes.",
        "COMMANDS: Use run_command for shell operations. Output is limited — for large outputs, use search_content or read_file with offset/limit instead.",
      ].join("\n"),
    }
  );

  const readFileTool = new ReadFileTool();
  const searchFilesTool = new SearchFilesTool();
  const searchContentTool = new SearchContentTool();
  const editFileTool = new EditFileTool();
  const writeFileTool = new WriteFileTool();
  const listDirectoryTool = new ListDirectoryTool();
  const runCommandTool = new RunCommandTool();

  if (diffApprovalCallback) {
    editFileTool.setDiffApprovalCallback(diffApprovalCallback);
    writeFileTool.setDiffApprovalCallback(diffApprovalCallback);
  }

  server.tool(
    readFileTool.name,
    readFileTool.description,
    readFileTool.inputSchema.shape,
    readFileTool.execute.bind(readFileTool)
  );

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
    listDirectoryTool.name,
    listDirectoryTool.description,
    listDirectoryTool.inputSchema.shape,
    listDirectoryTool.execute.bind(listDirectoryTool)
  );

  server.tool(
    editFileTool.name,
    editFileTool.description,
    editFileTool.inputSchema.shape,
    editFileTool.execute.bind(editFileTool)
  );

  server.tool(
    writeFileTool.name,
    writeFileTool.description,
    writeFileTool.inputSchema.shape,
    writeFileTool.execute.bind(writeFileTool)
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
