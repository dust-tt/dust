import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Request, Response } from "express";
import express from "express";
import http from "http";

/**
 * Abstract base class for external-facing MCP services
 * Exposes Dust capabilities to external MCP clients via HTTP/SSE transport
 */
export abstract class ExternalMcpService {
  protected httpServer: http.Server | null = null;
  protected activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();
  protected requestedPort?: number;
  protected serverUrl: string | undefined;

  constructor(requestedPort?: number) {
    this.requestedPort = requestedPort;
  }

  /**
   * Create and configure an MCP server for a specific external client session
   * This is called for each new external client connection
   */
  abstract createMcpServer(): Promise<McpServer>;

  /**
   * Start the HTTP server and begin accepting external connections
   */
  async startServer(onServerStart?: (url: string) => void): Promise<string> {
    if (this.httpServer) {
      if (this.serverUrl && onServerStart) {
        onServerStart(this.serverUrl);
      }
      return this.serverUrl!;
    }

    const app = express();

    // SSE endpoint for external MCP clients
    app.get("/sse", async (req: Request, res: Response) => {
      console.error(
        `[SSE] External client connection from ${req.ip} for ${req.originalUrl}`
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
        console.error(`[SSE] External session ${sessionId} created`);

        const server = await this.createMcpServer();

        // Store session
        if (sessionId) {
          this.activeSessions.set(sessionId, { server, transport });
        }

        // Handle connection close
        res.on("close", () => {
          if (sessionId) {
            console.error(`[SSE] External connection closed for session ${sessionId}`);
            this.activeSessions.delete(sessionId);
          }
        });

        // Connect server to transport
        await server.connect(transport);
        console.error(`[SSE] Server connected for external session ${sessionId}`);
      } catch (error) {
        console.error("[SSE] Error handling external connection:", error);
        if (!res.headersSent) {
          res.status(500).end("Failed to establish SSE connection.");
        } else {
          res.end();
        }
        if (sessionId) {
          this.activeSessions.delete(sessionId);
        }
      }
    });

    // Message handling endpoint for external clients
    app.post("/message", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;

      try {
        if (!sessionId) {
          res.status(400).send("Missing sessionId query parameter");
          return;
        }

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          res.status(404).send(`Session not found: ${sessionId}`);
          return;
        }

        session.transport.handlePostMessage(req, res).catch((handlerError) => {
          console.error(
            `[POST /message] Error handling message for external session ${sessionId}:`,
            handlerError
          );
          if (!res.headersSent) {
            res.status(500).send("Error processing message");
          }
        });
      } catch (error) {
        console.error(
          `[POST /message] Error handling message for external session ${sessionId}:`,
          error
        );
        if (!res.headersSent) {
          res.status(500).send("Error processing message");
        }
      }
    });

    this.httpServer = http.createServer(app);

    const startHttpServer = (port = this.requestedPort || 0): Promise<number> =>
      new Promise((resolve, reject) => {
        if (!this.httpServer) {
          reject(new Error("HTTP server not initialized"));
          return;
        }

        this.httpServer.once("error", (err: Error & { code?: string }) => {
          if (this.requestedPort && err.code === "EADDRINUSE") {
            reject(new Error(`Port ${this.requestedPort} is already in use.`));
          } else if (err.code === "EADDRINUSE") {
            console.error(`Port ${port} in use, trying another...`);
            setTimeout(() => startHttpServer(0).then(resolve, reject), 100);
          } else {
            reject(err);
          }
        });

        this.httpServer!.listen(port, () => {
          const address = this.httpServer!.address();
          const boundPort = typeof address === "string" ? 0 : address?.port ?? 0;
          resolve(boundPort);
        });
      });

    try {
      const port = await startHttpServer();
      this.serverUrl = `http://localhost:${port}/sse`;
      console.error(`External MCP server listening on port ${port}`);
      
      if (onServerStart) {
        onServerStart(this.serverUrl);
      }

      // Graceful shutdown handler
      const shutdown = async () => {
        await this.disconnect();
        process.exit(0);
      };

      // Register shutdown handlers
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      return this.serverUrl;
    } catch (error) {
      console.error("Fatal external MCP server error:", error);
      throw error;
    }
  }

  /**
   * Get the server URL for external clients
   */
  getServerUrl(): string | undefined {
    return this.serverUrl;
  }

  /**
   * Disconnect and clean up all external connections
   */
  async disconnect(): Promise<void> {
    if (this.httpServer) {
      console.error("Shutting down external MCP server...");
      for (const [sessionId, session] of this.activeSessions) {
        try {
          await session.server.close();
          console.error(`Closed external session ${sessionId}`);
        } catch (error) {
          console.error(`Error closing external session ${sessionId}:`, error);
        }
      }

      this.httpServer.close();
      this.httpServer = null;
      this.activeSessions.clear();
      this.serverUrl = undefined;
    }
  }
}