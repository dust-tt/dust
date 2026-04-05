import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getInternalMCPServerToolDisplayLabels,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import { asDisplayName, slugify } from "@app/types/shared/utils/string_utils";

type ToolDisplayLabelsByTool = Record<string, ToolDisplayLabels>;

const INTERNAL_TOOL_DISPLAY_LABELS_BY_SERVER = Object.fromEntries(
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES.flatMap((serverName) => {
    const displayLabels = getInternalMCPServerToolDisplayLabels(serverName);

    if (!displayLabels) {
      return [];
    }

    return [[slugify(serverName), displayLabels] as const];
  })
) as Record<string, ToolDisplayLabelsByTool>;

const DEFAULT_REMOTE_TOOL_DISPLAY_LABELS_BY_SERVER = Object.fromEntries(
  DEFAULT_REMOTE_MCP_SERVERS.flatMap((server) => {
    if (!server.toolDisplayLabels) {
      return [];
    }

    return [[slugify(server.name), server.toolDisplayLabels] as const];
  })
) as Record<string, ToolDisplayLabelsByTool>;

function getToolCallNameParts(functionCallName: string) {
  const separatorIndex = functionCallName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (separatorIndex === -1) {
    return null;
  }

  return {
    serverName: functionCallName.slice(0, separatorIndex),
    toolName: functionCallName.slice(
      separatorIndex + TOOL_NAME_SEPARATOR.length
    ),
  };
}

function getServerNameCandidates(serverName: string): string[] {
  const lastNestedSeparatorIndex = serverName.lastIndexOf(TOOL_NAME_SEPARATOR);

  if (lastNestedSeparatorIndex === -1) {
    return [serverName];
  }

  return [
    serverName,
    serverName.slice(lastNestedSeparatorIndex + TOOL_NAME_SEPARATOR.length),
  ];
}

function resolveToolCallDisplayLabels(
  functionCallName: string
): ToolDisplayLabels | null {
  const parts = getToolCallNameParts(functionCallName);

  if (!parts) {
    return null;
  }

  for (const serverName of getServerNameCandidates(parts.serverName)) {
    const internalDisplayLabels =
      INTERNAL_TOOL_DISPLAY_LABELS_BY_SERVER[serverName]?.[parts.toolName];

    if (internalDisplayLabels) {
      return internalDisplayLabels;
    }

    const remoteDisplayLabels =
      DEFAULT_REMOTE_TOOL_DISPLAY_LABELS_BY_SERVER[serverName]?.[
        parts.toolName
      ];

    if (remoteDisplayLabels) {
      return remoteDisplayLabels;
    }
  }

  return null;
}

export function getToolCallDisplayLabel(
  functionCallName: string,
  context: "running" | "done" = "done"
): string {
  return (
    resolveToolCallDisplayLabels(functionCallName)?.[context] ??
    asDisplayName(functionCallName)
  );
}
