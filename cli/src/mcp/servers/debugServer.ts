import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response } from "express";
import express from "express";
import http from "http";
import * as readline from "readline";
import { z } from "zod";

import { normalizeError } from "../../utils/errors.js";

type DynamicTool = string;

// Export the test server function
export async function startDebugMcpServer(
  onServerStart: (url: string) => void,
  requestedPort?: number
): Promise<Result<void, Error>> {
  const app = express();

  // Store dynamic tools
  const tools = new Set<DynamicTool>();

  tools.add("default_tool");

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
          name: "debug-mcp-server",
          version: "1.0.0",
        });

        // Register all current tools
        for (const tool of tools) {
          newServer.tool(
            tool,
            "Debug tool: " + tool,
            { input: z.string().optional().describe("Optional input parameter") },
            async ({ input }: { input?: string }) => {
              return {
                content: [
                  {
                    type: "text",
                    text: `Executed ${tool}${input ? ` with input: ${input}` : ""}`,
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
  // Note: Using process.stdin.isTTY to determine if we can use terminal mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: process.stdin.isTTY || false,
    prompt: '> ',
  });

  const listTools = () => {
    console.error("\n[Test Server] Current tools:");
    if (tools.size === 0) {
      console.error("  (none)");
    } else {
      tools.forEach((tool) => {
        console.error(`  - ${tool}`);
      });
    }
    console.error("");
  };

  const addTool = (name: string) => {
    tools.add(name);
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
    const tool = tools.has(oldName);
    if (!tool) {
      console.error(`[Test Server] Tool not found: ${oldName}`);
      return;
    }
    tools.delete(oldName);
    tools.add(newName);
    console.error(`[Test Server] Renamed tool: ${oldName} -> ${newName}`);
    void rebuildServers();
  };

  // Track prompt state
  let promptState: { command: string; data?: string } | null = null;

  rl.on("line", (line) => {
    const input = line.trim();

    // Handle multi-step prompts
    if (promptState) {
      switch (promptState.command) {
        case "add":
          if (input) {
            addTool(input);
          }
          promptState = null;
          break;
        case "remove":
          if (input) {
            removeTool(input);
          }
          promptState = null;
          break;
        case "rename":
          if (!promptState.data) {
            // First prompt: old name
            if (input) {
              promptState.data = input;
              rl.setPrompt("New name: ");
              rl.prompt();
              return;
            } else {
              promptState = null;
            }
          } else {
            // Second prompt: new name
            if (input) {
              renameTool(promptState.data, input);
            }
            promptState = null;
            rl.setPrompt("> ");
          }
          break;
      }
      rl.prompt();
      return;
    }

    // Handle single-letter commands
    switch (input) {
      case "a":
        promptState = { command: "add" };
        rl.setPrompt("Tool name: ");
        rl.prompt();
        break;
      case "d":
        promptState = { command: "remove" };
        rl.setPrompt("Tool name to delete: ");
        rl.prompt();
        break;
      case "r":
        promptState = { command: "rename" };
        rl.setPrompt("Old name: ");
        rl.prompt();
        break;
      case "l":
        listTools();
        rl.prompt();
        break;
      case "h":
      case "?":
        console.error("\nCommands:");
        console.error("  a - Add a new tool");
        console.error("  d - Delete a tool");
        console.error("  r - Rename a tool");
        console.error("  l - List all tools");
        console.error("  h - Show this help");
        console.error("  x - Exit\n");
        rl.prompt();
        break;
      case "x":
      case "q":
      case "exit":
      case "quit":
        console.error("\nShutting down gracefully...");
        process.exit(0);
        break;
      case "":
        rl.prompt();
        break;
      default:
        console.error(`Unknown command: '${input}' (press 'h' for help)`);
        rl.prompt();
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
        name: "debug-mcp-server",
        version: "1.0.0",
      });

      // Register all current tools
      for (const tool of tools) {
        server.tool(
          tool,
          "Debug tool: " + tool,
          { input: z.string().optional().describe("Optional input parameter") },
          async ({ input }: { input?: string }) => {
            console.error(`[MCP Tool Called] ${tool} with input:`, input);
            const result: CallToolResult = {
              content: [
                {
                  type: "text",
                  text: `Executed ${tool}${input ? ` with input: ${input}` : ""}`,
                },
              ],
            };
            console.error(`[MCP Tool Success] ${tool} returning:`, JSON.stringify(result));
            return result;
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
    
    // Give Ink time to exit, then show the prompt
    setTimeout(() => {
      rl.prompt();
    }, 100);

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

