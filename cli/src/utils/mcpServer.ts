import express, { Request, Response, NextFunction } from "express";
import http from "http";
import os from "os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import {
  GetAgentConfigurationsResponseType,
  UserMessageType,
} from "@dust-tt/client";
import { getDustClient } from "./dustClient.js";
import { normalizeError } from "./errors.js";

// Define AgentConfiguration type locally or import if shared
type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

// Helper function to slugify agent names for tool names
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "_")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

// Export the main server function
export async function startMcpServer(
  selectedAgents: AgentConfiguration[],
  workspaceId: string,
  onServerStart: (url: string) => void
) {
  const app = express();

  // Add explicit types for req, res, next inside the middleware
  app.use("/", ((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  }) as any);

  // Add explicit types for req, res, next inside the middleware
  app.use("/", ((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/message")) {
      express.json()(req, res, next);
    } else {
      next();
    }
  }) as any);

  // Store active sessions
  const activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  // Add explicit types for req, res, next inside the middleware
  app.use("/", ((req: Request, res: Response, next: NextFunction) => {
    console.error(`[${req.method}] ${req.path}`, {
      query: req.query,
      headers: req.headers,
    });
    next();
  }) as any);

  // SSE endpoint
  app.get("/sse", async (req: Request, res: Response) => {
    console.error(
      `[SSE] Connection request from ${req.ip} for ${req.originalUrl}`
    );

    let transport: SSEServerTransport | undefined = undefined;
    let sessionId: string | undefined = undefined;

    try {
      // Configure socket for long-lived SSE connection
      req.socket.setTimeout(0);
      req.socket.setNoDelay(true);
      req.socket.setKeepAlive(true);

      // Create transport - passing res allows it to control the response stream
      transport = new SSEServerTransport("/message", res);
      sessionId = transport.sessionId;
      console.error(`[SSE] Session ${sessionId} created`);

      // Create MCP server instance
      const server = new McpServer(
        {
          name: "dust-cli-mcp-server",
          version: process.env.npm_package_version || "0.1.0",
        },
        {
          capabilities: { tools: {} },
        }
      );

      // Register agent tools
      for (const agent of selectedAgents) {
        const toolName = `run_agent_${slugify(
          agent.name
        )}_${agent.sId.substring(0, 4)}`;
        const toolDescription =
          agent.description || `Runs the ${agent.name} agent.`;

        server.tool(
          toolName,
          toolDescription,
          { userInput: z.string() },
          async ({ userInput }: { userInput: string }) => {
            try {
              const dustClient = await getDustClient();
              if (!dustClient) {
                throw new Error(
                  "Dust client not initialized. Please run 'dust login'."
                );
              }

              const convRes = await dustClient.createConversation({
                title: `MCP CLI (${toolName}) - ${new Date().toISOString()}`,
                visibility: "workspace",
                message: {
                  content: userInput,
                  mentions: [{ configurationId: agent.sId }],
                  context: {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    username: "mcp_cli_user",
                    fullName: null,
                    email: null,
                    profilePictureUrl: null,
                    origin: "api",
                  },
                },
                contentFragment: undefined,
              });

              if (convRes.isErr()) {
                throw new Error(
                  `Failed to create conversation: ${convRes.error.message}`
                );
              }

              const { conversation, message: createdUserMessage } =
                convRes.value;
              const streamRes = await dustClient.streamAgentAnswerEvents({
                conversation: conversation,
                userMessageId: createdUserMessage.sId,
              });

              if (streamRes.isErr()) {
                throw new Error(
                  `Failed to stream agent answer: ${streamRes.error.message}`
                );
              }

              let finalContent = "";
              for await (const event of streamRes.value.eventStream) {
                if (event.type === "generation_tokens") {
                  finalContent += event.text;
                } else if (event.type === "agent_error") {
                  throw new Error(`Agent error: ${event.error.message}`);
                } else if (event.type === "user_message_error") {
                  throw new Error(`User message error: ${event.error.message}`);
                }
              }

              return { content: [{ type: "text", text: finalContent.trim() }] };
            } catch (error) {
              console.error(`[MCP Tool Error ${toolName}]`, error);
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${normalizeError(error).message}`,
                  },
                ],
                isError: true,
              };
            }
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

      // Connect server to transport - This should now handle sending headers
      await server.connect(transport);
      console.error(`[SSE] Server connected for session ${sessionId}`);
    } catch (error) {
      console.error("[SSE] Error handling connection:", error);
      // If headers haven't been sent by the transport yet (e.g., error during connect),
      // try sending an error code. Otherwise, just end the response.
      if (!res.headersSent) {
        res.status(500).end("Failed to establish SSE connection.");
      } else {
        res.end();
      }
      // Use sessionId declared outside
      if (sessionId) {
        activeSessions.delete(sessionId);
      }
    }
  });

  // Message handling endpoint
  app.post("/message", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    console.error(
      `[POST /message] Received for session ${sessionId} from ${req.ip}. Host: ${req.headers.host}, Path: ${req.originalUrl}`
    );

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

      // Add logging around handlePostMessage
      console.error(
        `[POST /message] Attempting to handle message for ${sessionId}...`
      );
      session.transport
        .handlePostMessage(req, res)
        .then(() => {
          console.error(
            `[POST /message] Successfully handled message for ${sessionId}`
          );
        })
        .catch((handlerError) => {
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

  // Create HTTP server
  const httpServer = http.createServer(app);

  // Server startup function with automatic port selection
  const startHttpServer = (port = 0): Promise<number> =>
    new Promise((resolve, reject) => {
      httpServer.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
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
      console.error("Shutting down HTTP server...");
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

    // Register shutdown handlers
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Fatal HTTP server error:", error);
    process.exit(1);
  }
}
