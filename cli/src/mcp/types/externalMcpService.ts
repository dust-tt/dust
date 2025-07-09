import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpTransport } from "./transports/http.js";
import { ServerInfo } from "./serverInfo.js";

/**
 * Abstract base class for external-facing MCP services
 * Exposes Dust capabilities to external MCP clients via HTTP/SSE transport
 */
export abstract class ExternalMcpService {
  private transport: McpTransport;
  protected server: McpServer | null = null;
  protected serverInfo: ServerInfo;

  constructor(transport: McpTransport, serverInfo: ServerInfo) {
    this.transport = transport;
    this.serverInfo = serverInfo;
  }

  async startServer(): Promise<string> {
    await this.authenticate();
    this.createMcpServer();
    if (!this.server) {
      throw new Error("Failed to create MCP server");
    }
    return this.transport.start(this.server);
  }

  private createMcpServer(): McpServer | null {
    try {
      this.server = new McpServer(this.serverInfo);
      this.registerTools();
      return this.server;
    } catch (error) {
      console.error("Failed to create MCP Server: ", error);
      return null;
    }
  }

  protected async authenticate(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    this.transport.stop();
  }
  protected abstract registerTools(): void;
}
