import type { MCPOAuthExtraConfig } from "@app/lib/api/oauth/providers/mcp";

export class MCPOAuthRequiredError extends Error {
  extraConfig: MCPOAuthExtraConfig;

  constructor(extraConfig: MCPOAuthExtraConfig) {
    super(
      "You must do an OAuth registration flow before using this MCP server."
    );
    this.name = "MCPOAuthRequiredError";
    this.extraConfig = extraConfig;
  }
}
