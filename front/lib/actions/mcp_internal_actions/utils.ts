import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerInfo,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { OAuthProvider } from "@app/types";

export function makeInternalMCPServer(
  serverName: InternalMCPServerNameType,
  options?: {
    augmentedInstructions?: string;
  }
): McpServer {
  const serverInfo = getInternalMCPServerInfo(serverName);
  const instructions =
    options?.augmentedInstructions ?? serverInfo.instructions ?? undefined;

  return new McpServer(serverInfo, {
    instructions,
  });
}

export function makePersonalAuthenticationError(
  provider: OAuthProvider,
  scope?: string
) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_personal_auth_required",
          scope,
          provider,
          text: "Personal authentication required",
          uri: "",
        },
      },
    ],
  };
}

export function makeFileAuthorizationError({
  fileId,
  fileName,
  connectionId,
  mimeType,
}: {
  fileId: string;
  fileName: string;
  connectionId: string;
  mimeType: string;
}) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_file_auth_required",
          fileId,
          fileName,
          connectionId,
          mimeType_file: mimeType,
          text: `File authorization required for ${fileName}`,
          uri: "",
        },
      },
    ],
  };
}

export function makeMCPToolExit({
  message,
  isError,
}: {
  message: string;
  isError: boolean;
}) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          text: message,
          type: "tool_early_exit",
          isError,
          uri: "",
        },
      },
    ],
  };
}

export function isJITMCPServerView(view: MCPServerViewType): boolean {
  return (
    !matchesInternalMCPServerName(view.server.sId, "agent_memory") &&
    // Only tools that do not require any configuration can be enabled directly in a conversation.
    getMCPServerRequirements(view).noRequirement
  );
}

// Converts a JSON object to Markdown format with bullet points.
// Recursively handles nested objects and arrays with proper indentation.
// Includes protections against circular references and excessive depth.
export function jsonToMarkdown<T = unknown>(
  data: T,
  primaryKey?: string,
  primaryKeyPrefix: string = "",
  indent: number = 0,
  visited: WeakSet<object> = new WeakSet(),
  maxDepth: number = 15
): string {
  const indentStr = "  ".repeat(indent);

  // Max depth protection
  if (indent >= maxDepth) {
    return `${indentStr}- [Max depth reached]`;
  }

  // Helper to format primitive values
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "(empty)";
    }
    if (typeof value === "string") {
      return (
        value
          // Remove newlines
          .replace(/[\r\n]+/g, " ")
          // Remove Markdown bold/italic patterns
          .replace(/\*\*\*/g, "") // Bold+italic (***text***)
          .replace(/\*\*/g, "") // Bold (**text**)
          .replace(/___/g, "") // Bold+italic (___text___)
          .replace(/__/g, "") // Bold (__text__)
          // Remove backticks for code
          .replace(/```/g, "") // Code blocks (```code```)
          .replace(/`/g, "") // Inline code (`code`)
          .trim()
      );
    }
    // Numbers and booleans
    return String(value);
  };

  // Handle primitives and special types
  if (typeof data !== "object" || data === null) {
    return `${indentStr}- ${formatValue(data)}`;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `${indentStr}- []`;
    }
    if (visited.has(data)) {
      return `${indentStr}- [Circular Reference]`;
    }

    visited.add(data);
    const result = data
      .map((item, index) => {
        const itemMarkdown = jsonToMarkdown(
          item,
          primaryKey,
          primaryKeyPrefix,
          indent,
          visited,
          maxDepth
        );
        if (typeof item === "object" && item !== null && index > 0) {
          return indent === 0
            ? `\n---\n\n${itemMarkdown}`
            : `\n${itemMarkdown}`;
        }
        return itemMarkdown;
      })
      .join("\n");
    visited.delete(data);
    return result;
  }

  // Handle objects
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return `${indentStr}- {}`;
  }
  if (visited.has(data)) {
    return `${indentStr}- [Circular Reference]`;
  }

  visited.add(data);

  // Check if this object has the primaryKey
  const dataAsRecord = data as Record<string, unknown>;
  const hasPrimaryKey = primaryKey && dataAsRecord[primaryKey] !== undefined;
  let entriesToProcess = entries;
  let headerLine = "";

  if (hasPrimaryKey) {
    // Create title from primaryKey
    const primaryValue = formatValue(dataAsRecord[primaryKey]);
    const title = primaryKeyPrefix
      ? `${primaryKeyPrefix} ${primaryValue}`
      : primaryValue;
    headerLine = `${indentStr}- **${title}:**\n`;

    // Remove primaryKey from entries to avoid duplication
    entriesToProcess = entries.filter(([key]) => key !== primaryKey);

    // If only primaryKey existed, return just the title
    if (entriesToProcess.length === 0) {
      visited.delete(data);
      return `${indentStr}- **${title}:**`;
    }
  }

  // Process all remaining entries
  const childIndent = hasPrimaryKey ? indentStr + "  " : indentStr;
  const nextIndent = hasPrimaryKey ? indent + 2 : indent + 1;

  const result = entriesToProcess
    .map(([key, value]) => {
      // Handle nested objects and arrays
      if (value !== null && typeof value === "object") {
        if (Array.isArray(value) && value.length === 0) {
          return `${childIndent}- **${key}:** []`;
        }
        if (!Array.isArray(value) && Object.entries(value).length === 0) {
          return `${childIndent}- **${key}:** {}`;
        }
        return `${childIndent}- **${key}:**\n${jsonToMarkdown(
          value,
          primaryKey,
          primaryKeyPrefix,
          nextIndent,
          visited,
          maxDepth
        )}`;
      }

      // Handle primitives
      return `${childIndent}- **${key}:** ${formatValue(value)}`;
    })
    .join("\n");

  visited.delete(data);
  return hasPrimaryKey ? headerLine + result : result;
}
