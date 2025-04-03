import express, { Request, Response, NextFunction } from "express";
import http from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { GetAgentConfigurationsResponseType } from "@dust-tt/client";
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
  onServerStart: (url: string) => void,
  requestedPort?: number
) {
  const dustClient = await getDustClient();
  if (!dustClient) {
    throw new Error("Dust client not initialized. Please run 'dust login'.");
  }

  const meRes = await dustClient.me();
  if (meRes.isErr()) {
    throw new Error(`Failed to get user information: ${meRes.error.message}`);
  }

  const user = meRes.value;

  const app = express();

  const activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

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

      transport = new SSEServerTransport("/message", res);
      sessionId = transport.sessionId;
      console.error(`[SSE] Session ${sessionId} created`);

      const server = new McpServer({
        name: "dust-cli-mcp-server",
        version: process.env.npm_package_version || "0.1.0",
      });

      for (const agent of selectedAgents) {
        const toolName = `run_agent_${slugify(agent.name)}`;
        let toolDescription = `This tool allows to call a Dust AI agent name ${agent.name}.`;
        if (agent.description) {
          toolDescription += `\nThe agent is described as follows: ${agent.description}`;
        }

        server.tool(
          toolName,
          toolDescription,
          { userInput: z.string().describe("The user input to the agent.") },
          async ({ userInput }: { userInput: string }) => {
            const convRes = await dustClient.createConversation({
              title: `MCP CLI (${toolName}) - ${new Date().toISOString()}`,
              visibility: "unlisted",
              message: {
                content: userInput,
                mentions: [{ configurationId: agent.sId }],
                context: {
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  username: user.username,
                  fullName: user.fullName,
                  email: user.email,
                  profilePictureUrl: user.image,
                  origin: "api",
                },
              },
              contentFragment: undefined,
            });

            if (convRes.isErr()) {
              const errorMessage = `Failed to create conversation: ${convRes.error.message}`;
              console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
              return {
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              };
            }

            const { conversation, message: createdUserMessage } = convRes.value;
            const streamRes = await dustClient.streamAgentAnswerEvents({
              conversation: conversation,
              userMessageId: createdUserMessage.sId,
            });

            if (streamRes.isErr()) {
              const errorMessage = `Failed to stream agent answer: ${streamRes.error.message}`;
              console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
              return {
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              };
            }

            let finalContent = "";
            try {
              for await (const event of streamRes.value.eventStream) {
                if (event.type === "generation_tokens") {
                  finalContent += event.text;
                } else if (event.type === "agent_error") {
                  const errorMessage = `Agent error: ${event.error.message}`;
                  console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
                  return {
                    content: [{ type: "text", text: errorMessage }],
                    isError: true,
                  };
                } else if (event.type === "user_message_error") {
                  const errorMessage = `User message error: ${event.error.message}`;
                  console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
                  return {
                    content: [{ type: "text", text: errorMessage }],
                    isError: true,
                  };
                } else if (event.type === "agent_message_success") {
                  break;
                }
              }
            } catch (streamError) {
              const errorMessage = `Error processing agent stream: ${
                normalizeError(streamError).message
              }`;
              console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
              return {
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              };
            }

            console.error(`[MCP Tool Success ${toolName}] Execution finished.`);
            return { content: [{ type: "text", text: finalContent.trim() }] };
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
      httpServer.once("error", (err: NodeJS.ErrnoException) => {
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
