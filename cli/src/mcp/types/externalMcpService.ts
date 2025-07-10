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

  // Template method
  async startServer(): Promise<string> {
    await this.authenticate();

    this.server = new McpServer(this.serverInfo);
    if (!this.server) {
      throw new Error("Failed to create MCP server");
    }

    this.registerTools();

    return this.transport.start(this.server);
  }

  // Not Required, but over-rideable
  protected async authenticate(): Promise<void> {
    return;
  }

  // Required
  protected abstract registerTools(): void;

  // Not Template, but globally shared
  async disconnect(): Promise<void> {
    this.transport.stop();
  }
}
