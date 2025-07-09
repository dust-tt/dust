import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import http from "http";
import type { Request, Response } from "express";
import express from "express";

// Transport abstraction
export interface McpTransport {
  start(server: McpServer): Promise<string>;
  stop(): Promise<void>;
}

// HTTP Transport implementation
export class HttpMcpTransport implements McpTransport {
  private httpServer: http.Server | null = null;
  private requestedPort: number | null = null;
  private activeSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  constructor(requestedPort?: number) {
    this.requestedPort = requestedPort ? requestedPort : null;
  }

  async start(server: McpServer): Promise<string> {
    const app = express();

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

        console.error(`[SSE] External session ${sessionId} created`);

        // Store session
        if (sessionId) {
          this.activeSessions.set(sessionId, { server, transport });
        }

        // Handle connection close
        res.on("close", () => {
          if (sessionId) {
            console.error(
              `[SSE] External connection closed for session ${sessionId}`
            );
            this.activeSessions.delete(sessionId);
          }
        });

        // Connect server to transport
        await server.connect(transport);
        console.error(
          `[SSE] Server connected for external session ${sessionId}`
        );
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
          this.activeSessions.delete(sessionId);
        }
      }
    });

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
          `[POST /message] Error handling message for session ${sessionId}:`,
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
          const boundPort =
            typeof address === "string" ? 0 : address?.port ?? 0;
          resolve(boundPort);
        });
      });

    const port = await startHttpServer();
    const serverUrl = `http://localhost:${port}/sse`;
    console.error(`External MCP server listening on port ${port}`);

    return serverUrl;
  }

  async stop(): Promise<void> {
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
    }
  }
}
