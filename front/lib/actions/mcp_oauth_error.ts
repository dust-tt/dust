import type { MCPOAuthConnectionMetadataType } from "@app/lib/api/oauth/providers/mcp";

export class MCPOAuthRequiredError extends Error {
  connectionMetadata: MCPOAuthConnectionMetadataType;

  constructor(connectionMetadata: MCPOAuthConnectionMetadataType) {
    super(
      "You must do an OAuth registration flow before using this MCP server."
    );
    this.name = "MCPOAuthRequiredError";
    this.connectionMetadata = connectionMetadata;
  }
}
