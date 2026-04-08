import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getInternalMCPServerToolDisplayLabels,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import {
  isDataSourceFilesystemFindInputType,
  isGenerateImageInputType,
  isSearchInputType,
  isWebbrowseInputType,
  isWebsearchInputType,
} from "@app/lib/actions/mcp_internal_actions/types";
import type { ToolDisplayLabels } from "@app/lib/api/mcp";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { asDisplayName, slugify } from "@app/types/shared/utils/string_utils";

type ToolDisplayLabelsByTool = Record<string, ToolDisplayLabels>;

const MAX_QUERY_DISPLAY_LENGTH = 60;

function truncateQuery(query: string): string {
  return query.length > MAX_QUERY_DISPLAY_LENGTH
    ? query.slice(0, MAX_QUERY_DISPLAY_LENGTH) + "…"
    : query;
}

function shortenUrl(url: string): string {
  return truncateQuery(url.replace(/^https?:\/\//, ""));
}

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

function getStaticToolDisplayLabelsForServerName(
  serverName: string,
  toolName: string
): ToolDisplayLabels | null {
  const normalizedServerName = slugify(serverName);

  return (
    INTERNAL_TOOL_DISPLAY_LABELS_BY_SERVER[normalizedServerName]?.[toolName] ??
    DEFAULT_REMOTE_TOOL_DISPLAY_LABELS_BY_SERVER[normalizedServerName]?.[
      toolName
    ] ??
    null
  );
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

export function getToolNameFromFunctionCallName(functionCallName: string) {
  return functionCallName.split(TOOL_NAME_SEPARATOR).at(-1) ?? functionCallName;
}

export function getStaticToolDisplayLabels({
  internalMCPServerName,
  mcpServerName,
  toolName,
  inputs,
}: {
  internalMCPServerName?: InternalMCPServerNameType | null;
  mcpServerName?: string | null;
  toolName: string;
  inputs: Record<string, unknown>;
}): ToolDisplayLabels | null {
  if (internalMCPServerName) {
    const dynamicLabels = getDynamicToolDisplayLabels({
      internalMCPServerName,
      toolName,
      inputs,
    });
    if (dynamicLabels) {
      return dynamicLabels;
    }

    return getStaticToolDisplayLabelsForServerName(
      internalMCPServerName,
      toolName
    );
  }

  if (mcpServerName) {
    return getStaticToolDisplayLabelsForServerName(mcpServerName, toolName);
  }

  return null;
}

export function getStaticToolDisplayLabelsFromFunctionCallName(
  functionCallName: string
): ToolDisplayLabels | null {
  const parts = getToolCallNameParts(functionCallName);

  if (!parts) {
    return null;
  }

  for (const serverName of getServerNameCandidates(parts.serverName)) {
    const displayLabels = getStaticToolDisplayLabelsForServerName(
      serverName,
      parts.toolName
    );

    if (displayLabels) {
      return displayLabels;
    }
  }

  return null;
}

export function getToolCallDisplayLabel(
  functionCallName: string,
  context: "running" | "done" = "done"
): string {
  return (
    getStaticToolDisplayLabelsFromFunctionCallName(functionCallName)?.[
      context
    ] ?? asDisplayName(functionCallName)
  );
}
