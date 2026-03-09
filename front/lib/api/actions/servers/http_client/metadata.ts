import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { WEB_SEARCH_BROWSE_TOOLS_METADATA } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const HTTP_CLIENT_TOOL_NAME = "http_client" as const;

export const DEFAULT_TIMEOUT_MS = 30_000;

export const HTTP_CLIENT_TOOLS_METADATA = createToolsRecord({
  send_request: {
    description:
      "Send an HTTP request to an external API. Returns the response status, headers, and body. If a secret is configured for this server, it will be automatically used as a Bearer token for authentication.",
    schema: {
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
    stake: "low",
    enableAlerting: true,
    displayLabels: {
      running: "Sending HTTP request",
      done: "Send HTTP request",
    },
  },
});

export const HTTP_CLIENT_INSTRUCTIONS = `
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

// Combine http_client tools with web tools for metadata
const ALL_HTTP_CLIENT_TOOLS_METADATA = {
  ...HTTP_CLIENT_TOOLS_METADATA,
  ...WEB_SEARCH_BROWSE_TOOLS_METADATA,
};

export const HTTP_CLIENT_SERVER = {
  serverInfo: {
    name: HTTP_CLIENT_TOOL_NAME,
    version: "1.0.0",
    description:
      "Make HTTP requests to external APIs with optional Bearer token authentication.",
    authorization: null,
    icon: "ActionGlobeAltIcon" as const,
    documentationUrl: null,
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
    instructions: HTTP_CLIENT_INSTRUCTIONS,
    developerSecretSelection: "optional" as const,
    developerSecretSelectionDescription:
      "This is optional. If set, this secret will be used as a default Bearer token (Authorization header) for HTTP requests.",
  },
  tools: Object.values(ALL_HTTP_CLIENT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ALL_HTTP_CLIENT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
