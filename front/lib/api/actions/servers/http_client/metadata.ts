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
      "Send an HTTP request to an external REST API and get back the status, headers, and body. " +
      "Only text-based responses are returned (binary is omitted) and bodies are truncated at ~1MB. " +
      "Bearer auth is only via a pre-configured server secret, sent as Authorization: Bearer. " +
      "You cannot set the Authorization header yourself and OAuth is unsupported, but other key schemes (e.g. X-Api-Key) can go in `headers`. " +
      "If you don't already know the API's exact contract, use `websearch`/`webbrowser` to read its docs " +
      "(reference, OpenAPI/Swagger) before calling rather than guessing the endpoint. If no docs exist, say so.",
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
    instructions: null,
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
