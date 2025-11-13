import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  registerWebBrowserTool,
  registerWebSearchTool,
} from "@app/lib/actions/mcp_internal_actions/tools/web_browser/web_browser_tools";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { decrypt, Err, normalizeError, Ok } from "@app/types";

const MAX_RESPONSE_SIZE = 1_000_000; // 1MB
const DEFAULT_TIMEOUT_MS = 30_000;

const TEXT_BASED_CONTENT_TYPES = [
  "text",
  "html",
  "javascript",
  "xml",
  "json",
  "css",
  "csv",
];
const SAFE_RESPONSE_HEADERS = ["content-type", "content-length"];

const HTTP_CLIENT_INSTRUCTIONS = `
This tool allows you to make HTTP requests to external endpoints. It is particularly useful for:

- Interacting with public REST APIs
- Fetching data from web services
- Integrating with third-party services

**CRITICAL: If you are not provided with the specific HTTP request details, you must search for the API documentation first.**

If you are not provided with the specific HTTP request parameters, you MUST:

1. **Use the websearch search tool aggressively** to find the API documentation:
   - Look for official documentation sites
   - Look for REST API reference documentation
   - Look for developer guides

2. **Use the webbrowser tool to read documentation**:
   - Browse the official documentation sites found in search results
   - Look for OpenAPI/Swagger specifications
   - Read Postman collections and GitHub repositories with API examples
   - Navigate through official developer portals and API reference documentation

3. **Extract key information from the documentation**:
   - Base URL and versioning
   - Authentication methods (API keys, OAuth, Bearer tokens)
   - Required headers
   - Request/response formats
   - Rate limits
   - Error codes and meanings
   - Example requests and responses

4. **Make HTTP requests with proper authentication, headers, and request formatting**.

**If you cannot find documentation, explicitly state this limitation.**

**NEVER make HTTP requests to unknown APIs without first searching for and reading their documentation.**

Note, you can only make HTTP requests with bearer tokens or no authentication. You cannot call endpoints that require oauth.
`;

async function getBearerToken(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<string | null> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return null;
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const bearerToken = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;

  return bearerToken;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("http_client", {
    augmentedInstructions: HTTP_CLIENT_INSTRUCTIONS,
  });

  server.tool(
    "send_request",
    "Send an HTTP request to an external API. Returns the response status, headers, and body. If a secret is configured for this server, it will be automatically used as a Bearer token for authentication.",
    {
      url: z
        .string()
        .url()
        .describe(
          "The full URL to make the request to (must include protocol, e.g., https://api.example.com/endpoint)"
        ),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
        .default("GET")
        .describe("The HTTP method to use. Defaults to GET."),
      headers: z
        .record(z.string())
        .optional()
        .describe(
          "Optional HTTP headers to include in the request as a key-value object (e.g., {'Authorization': 'Bearer token', 'Content-Type': 'application/json'})"
        ),
      body: z
        .string()
        .optional()
        .describe(
          "Optional request body as a string. For JSON APIs, stringify your JSON object. Not applicable for GET, HEAD, or OPTIONS requests."
        ),
      timeout_ms: z
        .number()
        .int()
        .positive()
        .max(60_000)
        .optional()
        .describe(
          `Request timeout in milliseconds. Defaults to ${DEFAULT_TIMEOUT_MS}ms. Maximum is 60 seconds.`
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "http_request",
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ url, method, headers, body, timeout_ms }) => {
        const timeoutMs = timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const requestHeaders = validateAndSanitizeHeaders(headers);

        const bearerToken = await getBearerToken(auth, agentLoopContext);
        if (bearerToken) {
          requestHeaders["Authorization"] = `Bearer ${bearerToken}`;
        }

        try {
          const response = await untrustedFetch(url, {
            method,
            headers: requestHeaders,
            body: body ?? undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          let responseBody = "";
          const contentType =
            response.headers.get("content-type")?.toLowerCase() ?? "";

          if (
            TEXT_BASED_CONTENT_TYPES.some((type) => contentType.includes(type))
          ) {
            const bodyText = await response.text();

            // Limit response size to prevent overwhelming the context
            if (bodyText.length > MAX_RESPONSE_SIZE) {
              responseBody =
                bodyText.slice(0, MAX_RESPONSE_SIZE) +
                `\n\n[... response truncated, exceeded ${MAX_RESPONSE_SIZE} bytes]`;
            } else {
              responseBody = bodyText;
            }
          } else {
            responseBody = `[Content type not displayed. Content-Type: ${contentType}, Size: ${response.headers.get("content-length") ?? "unknown"} bytes]`;
          }

          const resultText = [
            `HTTP ${response.status} ${response.statusText}`,
            "",
            "Response Headers:",
            ...Object.entries(response.headers)
              .filter(([key]) =>
                SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())
              )
              .map(([key, value]) => `  ${key}: ${value}`),
            "",
            "Response Body:",
            responseBody,
          ].join("\n");

          return new Ok([
            {
              type: "text",
              text: resultText,
            },
          ]);
        } catch (error) {
          clearTimeout(timeoutId);

          if (error instanceof Error && error.name === "AbortError") {
            return new Err(
              new MCPError(`Request timed out after ${timeoutMs}ms`, {
                tracked: false,
              })
            );
          }

          return new Err(
            new MCPError(
              `HTTP request failed: ${normalizeError(error).message}`,
              {
                tracked: false,
              }
            )
          );
        }
      }
    )
  );

  registerWebSearchTool(auth, server, agentLoopContext);
  registerWebBrowserTool(auth, server, agentLoopContext);

  return server;
}

function validateAndSanitizeHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  const requestHeaders: Record<string, string> = {};
  const bannedHeaders = [
    "host",
    "authorization",
    "content-length",
    "transfer-encoding",
  ];

  if (!headers) {
    return requestHeaders;
  }

  for (const [key, value] of Object.entries(headers)) {
    // Check for CRLF injection
    if (
      key.includes("\n") ||
      key.includes("\r") ||
      value.includes("\n") ||
      value.includes("\r")
    ) {
      throw new Error(`Invalid header: ${key} contains newline characters`);
    }

    // Prevent overwriting security-sensitive headers
    if (bannedHeaders.includes(key.toLowerCase())) {
      continue; // Skip banned headers
    }

    requestHeaders[key] = value;
  }

  return requestHeaders;
}

export default createServer;
