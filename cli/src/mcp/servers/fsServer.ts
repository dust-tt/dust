import { InternalMcpService } from "../types/internalMcpService.js";
import type { ServerInfo } from "../types/serverInfo.js";

/**
 * Filesystem MCP service implementation
 * Provides file system tools through MCP protocol
 */
export class FileSystemMcpService extends InternalMcpService {
  private serverInfo: ServerInfo = {
    name: "fs-cli",
    version: process.env.npm_package_version || "0.1.0",
  };

  protected registerTools(): void {
    return;
  }

  protected getServerInfo(): ServerInfo {
    return this.serverInfo;
  }
}
