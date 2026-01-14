// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

export const HTTP_CLIENT_TOOL_NAME = "http_client" as const;

const DEFAULT_TIMEOUT_MS = 30_000;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const sendRequestSchema = {
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
};

export const websearchSchema = {
  query: z
    .string()
    .describe(
      "The query used to perform the Google search. If requested by the " +
        "user, use the Google syntax `site:` to restrict the search " +
        "to a particular website or domain."
    ),
};

export const webbrowserSchema = {
  urls: z.string().array().describe("List of urls to browse"),
  format: z
    .enum(["markdown", "html"])
    .optional()
    .describe("Format to return content: 'markdown' (default) or 'html'."),
  screenshotMode: z
    .enum(["none", "viewport", "fullPage"])
    .optional()
    .describe("Screenshot mode: 'none' (default), 'viewport', or 'fullPage'."),
  links: z
    .boolean()
    .optional()
    .describe("If true, also retrieve outgoing links from the page."),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const HTTP_CLIENT_TOOLS: MCPToolType[] = [
  {
    name: "send_request",
    description:
      "Send an HTTP request to an external API. Returns the response status, headers, and body. If a secret is configured for this server, it will be automatically used as a Bearer token for authentication.",
    inputSchema: zodToJsonSchema(z.object(sendRequestSchema)) as JSONSchema,
  },
  {
    name: "websearch",
    description:
      "A tool that performs a Google web search based on a string query.",
    inputSchema: zodToJsonSchema(z.object(websearchSchema)) as JSONSchema,
  },
  {
    name: "webbrowser",
    description:
      "A tool to browse websites, you can provide a list of urls to browse all at once.",
    inputSchema: zodToJsonSchema(z.object(webbrowserSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const HTTP_CLIENT_SERVER_INFO = {
  name: "http_client" as const,
  version: "1.0.0",
  description:
    "Make HTTP requests to external APIs with optional Bearer token authentication.",
  authorization: null,
  icon: "ActionGlobeAltIcon" as const,
  documentationUrl: null,
  instructions: null,
  developerSecretSelectionDescription:
    "This is optional. If set, this secret will be used as a default Bearer token (Authorization header) for HTTP requests.",
  developerSecretSelection: "optional" as const,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const HTTP_CLIENT_TOOL_STAKES = {
  send_request: "low",
  websearch: "never_ask",
  webbrowser: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
