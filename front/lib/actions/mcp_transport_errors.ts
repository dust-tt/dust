import { MCPOAuthProviderError } from "@app/lib/actions/mcp_oauth_provider";

/**
 * Detects authentication errors from the MCP SDK, whether they come from
 * MCPOAuthProvider (when an authProvider is supplied) or from the transport
 * layer (when the token is injected directly as a header and no authProvider
 * is present).
 *
 * Transport-level 401 errors surface as:
 *  - StreamableHTTPError (code 401) from the Streamable HTTP transport
 *  - SseError            (code 401) from the SSE transport during GET
 *  - plain Error with "(HTTP 401)" in the message from SSE POST
 */
export function isOAuthOrTransportAuthError(e: unknown): boolean {
  if (e instanceof MCPOAuthProviderError) {
    return true;
  }

  if (e instanceof Error) {
    // StreamableHTTPError and SseError both carry a numeric `code` property.
    if ("code" in e) {
      const coded = e as Error & { code: unknown };
      if (coded.code === 401 || coded.code === 403) {
        return true;
      }
    }

    // SSE transport POST path throws a plain Error whose message contains
    // the HTTP status, e.g. "Error POSTing to endpoint (HTTP 401): …".
    if (/\(HTTP 40[13]\)/.test(e.message)) {
      return true;
    }
  }

  return false;
}
