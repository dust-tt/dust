import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFilesCatTool } from "./cat";
import { registerFilesCreateTool } from "./create";
import { registerFilesGrepTool } from "./grep";
import { registerFilesListTool } from "./list";
import { registerFilesResolveTool } from "./resolve";

export function registerFilesTools(server: McpServer) {
  registerFilesListTool(server);
  registerFilesCatTool(server);
  registerFilesCreateTool(server);
  registerFilesGrepTool(server);
  registerFilesResolveTool(server);
}
