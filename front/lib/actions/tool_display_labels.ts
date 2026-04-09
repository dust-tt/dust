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

/**
 * Generate input-aware dynamic labels for internal MCP server tools.
 */
function getDynamicToolDisplayLabels({
  internalMCPServerName,
  toolName,
  inputs,
}: {
  internalMCPServerName: InternalMCPServerNameType;
  toolName: string;
  inputs: Record<string, unknown>;
}): ToolDisplayLabels | null {
  switch (internalMCPServerName) {
    case "web_search_&_browse":
    case "http_client":
      if (toolName === "websearch" && isWebsearchInputType(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Searched “${q}”`,
        };
      }
      if (toolName === "webbrowser" && isWebbrowseInputType(inputs)) {
        if (inputs.urls.length === 1) {
          const url = shortenUrl(inputs.urls[0]);
          return {
            running: `Browsing “${url}”`,
            done: `Browsed “${url}”`,
          };
        }
        return {
          running: `Browsing ${inputs.urls.length} web pages`,
          done: `Browsed ${inputs.urls.length} web pages`,
        };
      }
      return null;

    case "search":
      if (toolName === "semantic_search" && isSearchInputType(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Searched “${q}”`,
        };
      }
      return null;

    case "data_sources_file_system":
      if (
        toolName === "find" &&
        isDataSourceFilesystemFindInputType(inputs) &&
        inputs.query
      ) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Finding “${q}”`,
          done: `Found “${q}”`,
        };
      }
      if (toolName === "semantic_search" && isSearchInputType(inputs)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching “${q}”`,
          done: `Searched “${q}”`,
        };
      }
      return null;

    case "image_generation":
      if (toolName === "generate_image" && isGenerateImageInputType(inputs)) {
        const name = truncateQuery(inputs.outputName);
        return {
          running: `Generating “${name}”`,
          done: `Generated “${name}”`,
        };
      }
      return null;

    case "gmail":
      if (toolName === "create_draft" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Drafting “${s}”`,
          done: `Drafted “${s}”`,
        };
      }
      if (toolName === "send_mail" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Sending “${s}”`,
          done: `Sent “${s}”`,
        };
      }
      return null;

    case "slack":
    case "slack_bot":
      if (toolName === "post_message" && isString(inputs.to)) {
        const to = truncateQuery(inputs.to);
        return {
          running: `Posting to channel ${to}`,
          done: `Posted to channel ${to}`,
        };
      }
      return null;

    case "notion":
      if (toolName === "search" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching Notion “${q}”`,
          done: `Searched Notion “${q}”`,
        };
      }
      return null;

    case "extract_data":
      if (
        toolName === "extract_information_from_documents" &&
        isString(inputs.objective)
      ) {
        const o = truncateQuery(inputs.objective);
        return {
          running: `Extracting “${o}”`,
          done: `Extracted “${o}”`,
        };
      }
      return null;

    case "conversation_files":
      if (toolName === "semantic_search" && isString(inputs.query)) {
        const q = truncateQuery(inputs.query);
        return {
          running: `Searching files “${q}”`,
          done: `Searched files “${q}”`,
        };
      }
      return null;

    case "github": {
      const base =
        isString(inputs.owner) && isString(inputs.repo)
          ? `github.com/${inputs.owner}/${inputs.repo}`
          : null;
      if (
        toolName === "get_pull_request" &&
        base &&
        typeof inputs.pullNumber === "number"
      ) {
        const url = `${base}/pull/${inputs.pullNumber}`;
        return {
          running: `Retrieving ${url}`,
          done: `Retrieved ${url}`,
        };
      }
      if (
        toolName === "get_issue" &&
        base &&
        typeof inputs.issueNumber === "number"
      ) {
        const url = `${base}/issues/${inputs.issueNumber}`;
        return {
          running: `Retrieving ${url}`,
          done: `Retrieved ${url}`,
        };
      }
      if (toolName === "create_issue" && base && isString(inputs.title)) {
        const t = truncateQuery(inputs.title);
        return {
          running: `Creating issue on ${base}: “${t}”`,
          done: `Created issue on ${base}: “${t}”`,
        };
      }
      if (
        toolName === "comment_on_issue" &&
        base &&
        typeof inputs.issueNumber === "number"
      ) {
        const url = `${base}/issues/${inputs.issueNumber}`;
        return {
          running: `Commenting on ${url}`,
          done: `Commented on ${url}`,
        };
      }
      if (
        toolName === "create_pull_request_review" &&
        base &&
        typeof inputs.pullNumber === "number"
      ) {
        const url = `${base}/pull/${inputs.pullNumber}`;
        return {
          running: `Reviewing ${url}`,
          done: `Reviewed ${url}`,
        };
      }
      if (toolName === "list_issues" && base) {
        return {
          running: `Listing issues on ${base}`,
          done: `Listed issues on ${base}`,
        };
      }
      if (toolName === "list_pull_requests" && base) {
        return {
          running: `Listing PRs on ${base}`,
          done: `Listed PRs on ${base}`,
        };
      }
      return null;
    }

    case "google_calendar":
      if (toolName === "create_event" && isString(inputs.summary)) {
        const s = truncateQuery(inputs.summary);
        return {
          running: `Creating event “${s}”`,
          done: `Created event “${s}”`,
        };
      }
      if (toolName === "update_event" && isString(inputs.summary)) {
        const s = truncateQuery(inputs.summary);
        return {
          running: `Updating event “${s}”`,
          done: `Updated event “${s}”`,
        };
      }
      return null;

    case "outlook_calendar":
      if (
        (toolName === "create_event" || toolName === "update_event") &&
        isString(inputs.subject)
      ) {
        const s = truncateQuery(inputs.subject);
        const verb = toolName === "create_event" ? "Creating" : "Updating";
        const past = toolName === "create_event" ? "Created" : "Updated";
        return {
          running: `${verb} event “${s}”`,
          done: `${past} event “${s}”`,
        };
      }
      return null;

    case "outlook":
      if (toolName === "create_draft" && isString(inputs.subject)) {
        const s = truncateQuery(inputs.subject);
        return {
          running: `Drafting “${s}”`,
          done: `Drafted “${s}”`,
        };
      }
      return null;

    case "google_drive":
      if (toolName === "search_files" && isString(inputs.q)) {
        const q = truncateQuery(inputs.q);
        return {
          running: `Searching Drive “${q}”`,
          done: `Searched Drive “${q}”`,
        };
      }
      if (
        (toolName === "create_document" ||
          toolName === "create_spreadsheet" ||
          toolName === "create_presentation") &&
        isString(inputs.title)
      ) {
        const t = truncateQuery(inputs.title);
        return {
          running: `Creating “${t}”`,
          done: `Created “${t}”`,
        };
      }
      return null;

    // All other servers: no dynamic labels.
    case "agent_sidekick_agent_state":
    case "agent_sidekick_context":
    case "agent_management":
    case "agent_memory":
    case "agent_router":
    case "ashby":
    case "confluence":
    case "databricks":
    case "data_warehouses":
    case "file_generation":
    case "fathom":
    case "freshservice":
    case "gong":
    case "google_sheets":
    case "hubspot":
    case "include_data":
    case "interactive_content":
    case "slideshow":
    case "jira":
    case "luma":
    case "microsoft_drive":
    case "microsoft_excel":
    case "microsoft_teams":
    case "missing_action_catcher":
    case "monday":
    case "openai_usage":
    case "primitive_types_debugger":
    case "productboard":
    case "common_utilities":
    case "jit_testing":
    case "run_agent":
    case "run_dust_app":
    case "salesforce":
    case "salesloft":
    case "slab":
    case "snowflake":
    case "sound_studio":
    case "speech_generator":
    case "statuspage":
    case "toolsets":
    case "ukg_ready":
    case "user_mentions":
    case "val_town":
    case "vanta":
    case "front":
    case "zendesk":
    case "query_tables_v2":
    case "skill_management":
    case "schedules_management":
    case "project_manager":
    case "poke":
    case "project_conversation":
    case "sandbox":
    case "ask_user_question":
    default:
      return null;
  }
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

export function getToolDisplayLabels({
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
