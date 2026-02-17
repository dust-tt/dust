import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import {
  DEFAULT_TIMEOUT_MS,
  HTTP_CLIENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/http_client/metadata";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { decrypt } from "@app/types/shared/utils/hashing";

const MAX_RESPONSE_SIZE = 1_000_000; // 1MB

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

  const secret = await DustAppSecretModel.findOne({
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

async function handleSendRequest(
  {
    url,
    method,
    headers,
    body,
    timeout_ms,
  }: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
    headers?: Record<string, string>;
    body?: string;
    timeout_ms?: number;
  },
  { auth, agentLoopContext }: ToolHandlerExtra
) {
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

    if (TEXT_BASED_CONTENT_TYPES.some((type) => contentType.includes(type))) {
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
        .filter(([key]) => SAFE_RESPONSE_HEADERS.includes(key.toLowerCase()))
        .map(([key, value]) => `  ${key}: ${value}`),
      "",
      "Response Body:",
      responseBody,
    ].join("\n");

    return new Ok([
      {
        type: "text" as const,
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
      new MCPError(`HTTP request failed: ${normalizeError(error).message}`, {
        tracked: false,
      })
    );
  }
}

const handlers: ToolHandlers<typeof HTTP_CLIENT_TOOLS_METADATA> = {
  send_request: handleSendRequest,
};

export const TOOLS = buildTools(HTTP_CLIENT_TOOLS_METADATA, handlers);
