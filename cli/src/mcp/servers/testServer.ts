import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Request, Response } from "express";
import express from "express";
import http from "http";
import * as readline from "readline";
import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";

interface DynamicTool {
  name: string;
  description: string;
}

// Export the test server function
export async function startTestMcpServer(
  onServerStart: (url: string) => void,
  requestedPort?: number
): Promise<Result<void, Error>> {
  const app = express();

  // Store dynamic tools
  const tools = new Map<string, DynamicTool>();

  // Active sessions
  const activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  // Function to rebuild all servers with current tools
  const rebuildServers = async () => {
    for (const [sessionId, session] of activeSessions) {
      try {
        // Close the old server
        await session.server.close();

        // Create new server with current tools
        const newServer = new McpServer({
          name: "test-mcp-server",
          version: "1.0.0",
        });

        // Register all current tools
        for (const [toolName, tool] of tools) {
          newServer.tool(
            toolName,
            tool.description,
            { input: z.string().optional().describe("Optional input parameter") },
            async ({ input }: { input?: string }) => {
              return {
                content: [
                  {
                    type: "text",
                    text: `Executed ${toolName}${input ? ` with input: ${input}` : ""}`,
                  },
                ],
              };
            }
          );
        }

        // Update session
        activeSessions.set(sessionId, { server: newServer, transport: session.transport });
      } catch (error) {
        console.error(`Error rebuilding session ${sessionId}:`, error);
      }
    }
  };

  // CLI interface for tool management
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: false,
  });

  const listTools = () => {
    console.error("\n[Test Server] Current tools:");
    if (tools.size === 0) {
      console.error("  (none)");
    } else {
      tools.forEach((tool, name) => {
        console.error(`  - ${name}: ${tool.description}`);
      });
    }
    console.error("");
  };

  const addTool = (name: string, description: string) => {
    tools.set(name, { name, description });
    console.error(`[Test Server] Added tool: ${name}`);
    void rebuildServers();
  };

  const removeTool = (name: string) => {
    if (tools.delete(name)) {
      console.error(`[Test Server] Removed tool: ${name}`);
      void rebuildServers();
    } else {
      console.error(`[Test Server] Tool not found: ${name}`);
    }
  };

  const renameTool = (oldName: string, newName: string) => {
    const tool = tools.get(oldName);
    if (!tool) {
      console.error(`[Test Server] Tool not found: ${oldName}`);
      return;
    }
    tools.delete(oldName);
    tools.set(newName, { name: newName, description: tool.description });
    console.error(`[Test Server] Renamed tool: ${oldName} -> ${newName}`);
    void rebuildServers();
  };

  console.error("\n=== Test MCP Server ===");
  console.error("Commands:");
  console.error("  add <name>                - Add a new tool");
  console.error("  remove <name>             - Remove a tool");
  console.error("  rename <oldName> <newName> - Rename a tool");
  console.error("  list                      - List all tools");
  console.error("  help                      - Show this help");
  console.error("========================\n");

  rl.on("line", (line) => {
    const parts = line.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
      case "add": {
        const [, name] = parts;
        if (!name) {
          console.error("[Test Server] Usage: add <name>");
          break;
        }
        addTool(name, `Test tool: ${name}`);
        break;
      }
      case "remove": {
        const [, name] = parts;
        if (!name) {
          console.error("[Test Server] Usage: remove <name>");
          break;
        }
        removeTool(name);
        break;
      }
      case "rename": {
        const [, oldName, newName] = parts;
        if (!oldName || !newName) {
          console.error("[Test Server] Usage: rename <oldName> <newName>");
          break;
        }
        renameTool(oldName, newName);
        break;
      }
      case "list":
        listTools();
        break;
      case "help":
        console.error("\nCommands:");
        console.error("  add <name>                - Add a new tool");
        console.error("  remove <name>             - Remove a tool");
        console.error("  rename <oldName> <newName> - Rename a tool");
        console.error("  list                      - List all tools");
        console.error("  help                      - Show this help\n");
        break;
      default:
        if (command) {
          console.error(`[Test Server] Unknown command: ${command}`);
        }
    }
  });

  // SSE endpoint
  app.get("/sse", async (req: Request, res: Response) => {
    console.error(
      `[SSE] Connection request from ${req.ip} for ${req.originalUrl}`
    );

    let transport: SSEServerTransport | undefined = undefined;
    let sessionId: string | undefined = undefined;

    try {
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      req.socket.setKeepAlive(true);

      transport = new SSEServerTransport("/message", res);
      sessionId = transport.sessionId;
      console.error(`[SSE] Session ${sessionId} created`);

      const server = new McpServer({
        name: "test-mcp-server",
        version: "1.0.0",
      });

      // Register all current tools
      for (const [toolName, tool] of tools) {
        server.tool(
          toolName,
          tool.description,
          { input: z.string().optional().describe("Optional input parameter") },
          async ({ input }: { input?: string }) => {
            return {
              content: [
                {
                  type: "text",
                  text: `Executed ${toolName}${input ? ` with input: ${input}` : ""}`,
                },
              ],
            };
          }
        );
      }

      // Store session
      if (sessionId) {
        activeSessions.set(sessionId, { server, transport });
      }

      // Handle connection close
      res.on("close", () => {
        if (sessionId) {
          console.error(`[SSE] Connection closed for session ${sessionId}`);
          activeSessions.delete(sessionId);
        }
      });

      await server.connect(transport);
      console.error(`[SSE] Server connected for session ${sessionId}`);
    } catch (error) {
      console.error("[SSE] Error handling connection:", error);
      if (!res.headersSent) {
        res.status(500).end("Failed to establish SSE connection.");
      } else {
        res.end();
      }
      if (sessionId) {
        activeSessions.delete(sessionId);
      }
    }
  });

  // Message handling endpoint
  app.post("/message", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    try {
      if (!sessionId) {
        res.status(400).send("Missing sessionId query parameter");
        return;
      }

      const session = activeSessions.get(sessionId);
      if (!session) {
        res.status(404).send(`Session not found: ${sessionId}`);
        return;
      }

      session.transport.handlePostMessage(req, res).catch((handlerError) => {
        console.error(
          `[POST /message] Error handling message for session ${sessionId}:`,
          handlerError
        );
        if (!res.headersSent) {
          res.status(500).send("Error processing message");
        }
      });
    } catch (error) {
      console.error(
        `[POST /message] Error handling message for session ${sessionId}:`,
        error
      );
      if (!res.headersSent) {
        res.status(500).send("Error processing message");
      }
    }
  });

  const httpServer = http.createServer(app);

  const startHttpServer = (port = requestedPort || 0): Promise<number> =>
    new Promise((resolve, reject) => {
      httpServer.once("error", (err: Error & { code?: string }) => {
        if (requestedPort && err.code === "EADDRINUSE") {
          reject(new Error(`Port ${requestedPort} is already in use.`));
        } else if (err.code === "EADDRINUSE") {
          console.error(`Port ${port} in use, trying another...`);
          setTimeout(() => startHttpServer(0).then(resolve, reject), 100);
        } else {
          reject(err);
        }
      });

      httpServer.listen(port, () => {
        const address = httpServer.address();
        const boundPort = typeof address === "string" ? 0 : address?.port ?? 0;
        resolve(boundPort);
      });
    });

  // Start server
  try {
    const port = await startHttpServer();
    const url = `http://localhost:${port}/sse`;
    console.error(`HTTP server listening on port ${port}`);
    onServerStart(url);

    // Graceful shutdown handler
    const shutdown = async () => {
      console.error("Shutting down test server...");
      rl.close();
      for (const [sessionId, session] of activeSessions) {
        try {
          await session.server.close();
          console.error(`Closed session ${sessionId}`);
        } catch (error) {
          console.error(`Error closing session ${sessionId}:`, error);
        }
      }

      httpServer.close((err) => {
        if (err) {
          console.error("Error closing HTTP server:", err);
          process.exit(1);
        } else {
          console.error("HTTP server closed.");
          process.exit(0);
        }
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return new Ok(undefined);
  } catch (error) {
    console.error("Fatal HTTP server error:", error);
    return new Err(normalizeError(error));
  }
}

