import type { TimeFrame } from "@app/shared/lib/time_frame";
import { parseTimeFrame } from "@app/shared/lib/time_frame";
import { asDisplayName } from "@app/shared/lib/utils";
import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import { MCPBrowseActionDetails } from "@app/ui/components/actions/mcp/details/MCPBrowseActionDetails";
import {
  DataSourceNodeContentDetails,
  FilesystemPathDetails,
} from "@app/ui/components/actions/mcp/details/MCPDataSourcesFileSystemActionDetails";
import { MCPExtractActionDetails } from "@app/ui/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPGetDatabaseSchemaActionDetails } from "@app/ui/components/actions/mcp/details/MCPGetDatabaseSchemaActionDetails";
import { MCPReasoningActionDetails } from "@app/ui/components/actions/mcp/details/MCPReasoningActionDetails";
import { MCPTablesQueryActionDetails } from "@app/ui/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { SearchResultDetails } from "@app/ui/components/actions/mcp/details/MCPToolOutputDetails";
import type {
  AgentActionPublicType,
  LightWorkspaceType,
  ToolNotificationProgress,
} from "@dust-tt/client";
import {
  ActionDocumentTextIcon,
  BoltIcon,
  ClockIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
} from "@dust-tt/sparkle";

export interface MCPActionDetailsProps {
  action: AgentActionPublicType;
  owner: LightWorkspaceType;
  lastNotification: ToolNotificationProgress | null;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
  viewType: "conversation" | "sidebar";
}

export const SEARCH_TOOL_NAME = "semantic_search";
export const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";
export const QUERY_TABLES_TOOL_NAME = "query_tables";
export const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
export const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";
export const PROCESS_TOOL_NAME = "extract_information_from_documents";
export const RUN_AGENT_TOOL_NAME = "run_agent";
export const CREATE_AGENT_TOOL_NAME = "create_agent";
export const FIND_TAGS_TOOL_NAME = "find_tags";
export const FILESYSTEM_CAT_TOOL_NAME = "cat";
export const FILESYSTEM_FIND_TOOL_NAME = "find";
export const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
export const FILESYSTEM_LIST_TOOL_NAME = "list";

export function renderRelativeTimeFrameForToolOutput(
  relativeTimeFrame: TimeFrame | null
): string {
  return relativeTimeFrame
    ? "over the last " +
        (relativeTimeFrame.duration > 1
          ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
          : `${relativeTimeFrame.unit}`)
    : "across all time periods";
}

export function renderTagsForToolOutput(
  tagsIn?: string[],
  tagsNot?: string[]
): string {
  const tagsInAsString =
    tagsIn && tagsIn.length > 0 ? `, with labels ${tagsIn?.join(", ")}` : "";
  const tagsNotAsString =
    tagsNot && tagsNot.length > 0
      ? `, excluding labels ${tagsNot?.join(", ")}`
      : "";
  return `${tagsInAsString}${tagsNotAsString}`;
}

function renderSearchNodeIds(nodeIds?: string[]): string {
  return nodeIds && nodeIds.length > 0
    ? `within ${nodeIds.length} different subtrees `
    : "";
}

export function makeQueryResource({
  query,
  timeFrame,
  tagsIn,
  tagsNot,
  nodeIds,
}: {
  query: string;
  timeFrame: TimeFrame | null;
  tagsIn?: string[];
  tagsNot?: string[];
  nodeIds?: string[];
}): string {
  const timeFrameAsString = renderRelativeTimeFrameForToolOutput(timeFrame);
  const tagsAsString = renderTagsForToolOutput(tagsIn, tagsNot);
  const nodeIdsAsString = renderSearchNodeIds(nodeIds);

  return query
    ? `Searching "${query}" ${nodeIdsAsString}${timeFrameAsString}${tagsAsString}.`
    : `Searching ${timeFrameAsString}${tagsAsString}.`;
}

export function MCPActionDetails(props: MCPActionDetailsProps) {
  const {
    action: { output, functionCallName, internalMCPServerName, params },
    viewType,
  } = props;

  const parts = functionCallName ? functionCallName.split("__") : [];
  const toolName = parts[parts.length - 1];

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    if (toolName === SEARCH_TOOL_NAME) {
      const timeFrame = parseTimeFrame(params.relativeTimeFrame as string);
      const query = makeQueryResource({
        query: params.query as string,
        timeFrame: timeFrame,
        tagsIn: params.tagsIn as string[],
        tagsNot: params.tagsNot as string[],
        nodeIds: params.nodeIds as string[],
      });

      return (
        <SearchResultDetails
          viewType={viewType}
          defaultQuery={query}
          actionName={
            viewType === "conversation" ? "Searching data" : "Search data"
          }
          actionOutput={output}
          visual={MagnifyingGlassIcon}
        />
      );
    }

    if (
      toolName === FILESYSTEM_LIST_TOOL_NAME ||
      toolName === FILESYSTEM_FIND_TOOL_NAME
    ) {
      return (
        <SearchResultDetails
          viewType={viewType}
          actionName={
            viewType === "conversation"
              ? "Browsing data sources"
              : "Browse data sources"
          }
          actionOutput={output}
          visual={ActionDocumentTextIcon}
        />
      );
    }

    if (toolName === FILESYSTEM_CAT_TOOL_NAME) {
      return <DataSourceNodeContentDetails {...props} />;
    }

    if (toolName === FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME) {
      return <FilesystemPathDetails {...props} />;
    }
  }

  if (internalMCPServerName === "include_data") {
    if (toolName === INCLUDE_TOOL_NAME) {
      return (
        <SearchResultDetails
          viewType={viewType}
          actionName={
            viewType === "conversation" ? "Including data" : "Include data"
          }
          actionOutput={output}
          visual={ClockIcon}
        />
      );
    }
  }

  if (internalMCPServerName === "web_search_&_browse") {
    if (toolName === WEBSEARCH_TOOL_NAME) {
      return (
        <SearchResultDetails
          viewType={viewType}
          defaultQuery={params.query as string}
          actionName={
            viewType === "conversation" ? "Searching the web" : "Web search"
          }
          actionOutput={output}
          visual={GlobeAltIcon}
        />
      );
    }
    if (toolName === WEBBROWSER_TOOL_NAME) {
      return <MCPBrowseActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "query_tables") {
    if (toolName === QUERY_TABLES_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "query_tables_v2") {
    if (toolName === GET_DATABASE_SCHEMA_TOOL_NAME) {
      return <MCPGetDatabaseSchemaActionDetails {...props} />;
    }
    if (toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME) {
      return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "reasoning") {
    return <MCPReasoningActionDetails {...props} />;
  }

  if (internalMCPServerName === "extract_data") {
    if (toolName === PROCESS_TOOL_NAME) {
      return <MCPExtractActionDetails {...props} />;
    }
  }

  //TODO: to implement
  //   if (isInternalMCPServerOfName(mcpServerId, "run_agent")) {
  //     return <MCPRunAgentActionDetails {...props} />;
  //   }

  //   if (isInternalMCPServerOfName(mcpServerId, "agent_management")) {
  //     return <MCPAgentManagementActionDetails {...props} />;
  //   }

  return <GenericActionDetails {...props} />;
}

export function GenericActionDetails({
  action,
  viewType,
}: MCPActionDetailsProps) {
  const actionName =
    (viewType === "conversation" ? "Running a tool" : "Run a tool") +
    (action.functionCallName
      ? `: ${asDisplayName(action.functionCallName)}`
      : "");

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={BoltIcon}
    >
      <></>
    </ActionDetailsWrapper>
  );
}
