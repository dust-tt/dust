#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as readline from "readline";

class TestMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "test-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tools = new Map();

    // Initialize with some default tools
    this.addTool({
      name: "search_documentation",
      description: "Search through documentation (will be renamed to test sync)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    });

    this.addTool({
      name: "get_status",
      description: "Get server status",
      inputSchema: {
        type: "object",
        properties: {},
      },
    });

    this.setupHandlers();
    this.setupCLI();
  }

  addTool(tool) {
    this.tools.set(tool.name, tool);
    console.error(`[CLI] Added tool: ${tool.name}`);
  }

  removeTool(name) {
    if (this.tools.delete(name)) {
      console.error(`[CLI] Removed tool: ${name}`);
      return true;
    }
    console.error(`[CLI] Tool not found: ${name}`);
    return false;
  }

  listTools() {
    console.error("\n[CLI] Current tools:");
    this.tools.forEach((tool, name) => {
      console.error(`  - ${name}: ${tool.description}`);
    });
    console.error("");
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);
      if (!tool) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: `Executed ${request.params.name} with args: ${JSON.stringify(request.params.arguments)}`,
          },
        ],
      };
    });
  }

  setupCLI() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
    });

    console.error("\n=== Test MCP Server ===");
    console.error("Commands:");
    console.error("  add <name> <description>  - Add a new tool");
    console.error("  remove <name>             - Remove a tool");
    console.error("  list                      - List all tools");
    console.error("  rename <oldName> <newName> - Rename a tool (simulates tool update)");
    console.error("  help                      - Show this help");
    console.error("========================\n");

    this.listTools();

    this.rl.on("line", (line) => {
      const parts = line.trim().split(/\s+/);
      const command = parts[0];

      switch (command) {
        case "add": {
          const [, name, ...descParts] = parts;
          if (!name) {
            console.error("[CLI] Usage: add <name> <description>");
            break;
          }
          const description = descParts.join(" ") || "A test tool";
          this.addTool({
            name,
            description,
            inputSchema: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "Input parameter",
                },
              },
            },
          });
          break;
        }
        case "remove": {
          const [, name] = parts;
          if (!name) {
            console.error("[CLI] Usage: remove <name>");
            break;
          }
          this.removeTool(name);
          break;
        }
        case "rename": {
          const [, oldName, newName] = parts;
          if (!oldName || !newName) {
            console.error("[CLI] Usage: rename <oldName> <newName>");
            break;
          }
          const oldTool = this.tools.get(oldName);
          if (!oldTool) {
            console.error(`[CLI] Tool not found: ${oldName}`);
            break;
          }
          this.removeTool(oldName);
          this.addTool({
            ...oldTool,
            name: newName,
          });
          break;
        }
        case "list":
          this.listTools();
          break;
        case "help":
          console.error("\nCommands:");
          console.error("  add <name> <description>  - Add a new tool");
          console.error("  remove <name>             - Remove a tool");
          console.error("  rename <oldName> <newName> - Rename a tool");
          console.error("  list                      - List all tools");
          console.error("  help                      - Show this help\n");
          break;
        default:
          if (command) {
            console.error(`[CLI] Unknown command: ${command}`);
          }
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[Server] Test MCP Server running on stdio");
  }
}

const server = new TestMCPServer();
server.run().catch(console.error);

