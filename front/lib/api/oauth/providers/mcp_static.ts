import { MCPOAuthProvider } from "@app/lib/api/oauth/providers/mcp";
import type { OAuthProvider } from "@app/types";

// This provider is used to authenticate with MCP servers that require static OAuth credentials.
// It behaves exactly like the MCP provider but does requires the user to provide the various oauth credentials instead of using the discovery process.
export class MCPOAuthStaticOAuthProvider extends MCPOAuthProvider {
  provider: OAuthProvider = "mcp_static";
}
