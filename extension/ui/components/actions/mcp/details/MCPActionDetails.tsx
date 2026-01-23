import {
  isDataSourceFilesystemFindInputType,
  isDataSourceFilesystemListInputType,
  isIncludeInputType,
  isSearchInputType,
  isWebsearchInputType,
  makeQueryTextForDataSourceSearch,
  makeQueryTextForFind,
  makeQueryTextForInclude,
  makeQueryTextForList,
} from "@app/shared/lib/tool_inputs";
import { asDisplayName } from "@app/shared/lib/utils";
import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import { MCPAgentManagementActionDetails } from "@app/ui/components/actions/mcp/details/MCPAgentManagementActionDetails";
import {
  MCPAgentMemoryEditActionDetails,
  MCPAgentMemoryEraseActionDetails,
  MCPAgentMemoryRecordActionDetails,
  MCPAgentMemoryRetrieveActionDetails,
} from "@app/ui/components/actions/mcp/details/MCPAgentMemoryActionDetails";
import { MCPBrowseActionDetails } from "@app/ui/components/actions/mcp/details/MCPBrowseActionDetails";
import { MCPConversationCatFileDetails } from "@app/ui/components/actions/mcp/details/MCPConversationFilesActionDetails";
import {
  DataSourceNodeContentDetails,
  FilesystemPathDetails,
} from "@app/ui/components/actions/mcp/details/MCPDataSourcesFileSystemActionDetails";
import { MCPDataWarehousesBrowseDetails } from "@app/ui/components/actions/mcp/details/MCPDataWarehousesBrowseDetails";
import { MCPDeepDiveActionDetails } from "@app/ui/components/actions/mcp/details/MCPDeepDiveActionDetails";
import { MCPExtractActionDetails } from "@app/ui/components/actions/mcp/details/MCPExtractActionDetails";
import { MCPGetDatabaseSchemaActionDetails } from "@app/ui/components/actions/mcp/details/MCPGetDatabaseSchemaActionDetails";
import { MCPListToolsActionDetails } from "@app/ui/components/actions/mcp/details/MCPListToolsActionDetails";
import { MCPReasoningActionDetails } from "@app/ui/components/actions/mcp/details/MCPReasoningActionDetails";
import { MCPRunAgentActionDetails } from "@app/ui/components/actions/mcp/details/MCPRunAgentActionDetails";
import { MCPSkillEnableActionDetails } from "@app/ui/components/actions/mcp/details/MCPSkillEnableActionDetails";
import { MCPTablesQueryActionDetails } from "@app/ui/components/actions/mcp/details/MCPTablesQueryActionDetails";
import { SearchResultDetails } from "@app/ui/components/actions/mcp/details/MCPToolOutputDetails";
import { MCPToolsetsEnableActionDetails } from "@app/ui/components/actions/mcp/details/MCPToolsetsEnableActionDetails";
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

const SEARCH_TOOL_NAME = "semantic_search";

const INCLUDE_TOOL_NAME = "retrieve_recent_documents";

const WEBSEARCH_TOOL_NAME = "websearch";
const WEBBROWSER_TOOL_NAME = "webbrowser";

const QUERY_TABLES_TOOL_NAME = "query_tables";

const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";

const PROCESS_TOOL_NAME = "extract_information_from_documents";

const CONVERSATION_CAT_FILE_ACTION_NAME = "cat";

const FILESYSTEM_CAT_TOOL_NAME = "cat";
const FILESYSTEM_FIND_TOOL_NAME = "find";
const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
const FILESYSTEM_LIST_TOOL_NAME = "list";

const ENABLE_SKILL_TOOL_NAME = "enable_skill";

const DATA_WAREHOUSES_LIST_TOOL_NAME = "list";
const DATA_WAREHOUSES_FIND_TOOL_NAME = "find";
const DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME = "describe_tables";
const DATA_WAREHOUSES_QUERY_TOOL_NAME = "query";

const AGENT_MEMORY_RETRIEVE_TOOL_NAME = "retrieve";
const AGENT_MEMORY_RECORD_TOOL_NAME = "record_entries";
const AGENT_MEMORY_ERASE_TOOL_NAME = "erase_entries";
const AGENT_MEMORY_EDIT_TOOL_NAME = "edit_entries";
const AGENT_MEMORY_COMPACT_TOOL_NAME = "compact_memory";

const TOOLSETS_ENABLE_TOOL_NAME = "enable";
const TOOLSETS_LIST_TOOL_NAME = "list";

export function MCPActionDetails(props: MCPActionDetailsProps) {
  const {
    action: { toolName, internalMCPServerName, params },
    viewType,
  } = props;

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    switch (toolName) {
      case SEARCH_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            actionName={
              viewType === "conversation" ? "Searching data" : "Search data"
            }
            visual={MagnifyingGlassIcon}
            query={
              isSearchInputType(params)
                ? makeQueryTextForDataSourceSearch(params)
                : null
            }
          />
        );
      case FILESYSTEM_LIST_TOOL_NAME:
      case FILESYSTEM_FIND_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            actionName={
              viewType === "conversation"
                ? "Browsing data sources"
                : "Browse data sources"
            }
            query={
              isDataSourceFilesystemFindInputType(params)
                ? makeQueryTextForFind(params)
                : isDataSourceFilesystemListInputType(params)
                  ? makeQueryTextForList(params)
                  : null
            }
            visual={ActionDocumentTextIcon}
          />
        );
      case FILESYSTEM_CAT_TOOL_NAME:
        return <DataSourceNodeContentDetails {...props} />;
      case FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME:
        return <FilesystemPathDetails {...props} />;
    }
  }

  if (
    internalMCPServerName === "include_data" &&
    toolName === INCLUDE_TOOL_NAME
  ) {
    return (
      <SearchResultDetails
        viewType={viewType}
        actionName={
          viewType === "conversation" ? "Including data" : "Include data"
        }
        visual={ClockIcon}
        query={
          isIncludeInputType(params) ? makeQueryTextForInclude(params) : null
        }
      />
    );
  }

  if (internalMCPServerName === "web_search_&_browse") {
    switch (toolName) {
      case WEBSEARCH_TOOL_NAME:
        return (
          <SearchResultDetails
            viewType={viewType}
            query={isWebsearchInputType(params) ? params.query : null}
            actionName={
              viewType === "conversation" ? "Searching the web" : "Web search"
            }
            visual={GlobeAltIcon}
          />
        );
      case WEBBROWSER_TOOL_NAME:
        return <MCPBrowseActionDetails {...props} />;
    }
  }

  if (
    internalMCPServerName === "query_tables" &&
    toolName === QUERY_TABLES_TOOL_NAME
  ) {
    return <MCPTablesQueryActionDetails {...props} />;
  }

  if (internalMCPServerName === "query_tables_v2") {
    switch (toolName) {
      case GET_DATABASE_SCHEMA_TOOL_NAME:
        return <MCPGetDatabaseSchemaActionDetails {...props} />;
      case EXECUTE_DATABASE_QUERY_TOOL_NAME:
        return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (internalMCPServerName === "reasoning") {
    return <MCPReasoningActionDetails {...props} />;
  }

  if (
    internalMCPServerName === "extract_data" &&
    toolName === PROCESS_TOOL_NAME
  ) {
    return <MCPExtractActionDetails {...props} />;
  }

  if (internalMCPServerName === "run_agent") {
    return <MCPRunAgentActionDetails {...props} />;
  }

  if (internalMCPServerName === "deep_dive") {
    return <MCPDeepDiveActionDetails {...props} />;
  }

  if (internalMCPServerName === "agent_memory") {
    switch (toolName) {
      case AGENT_MEMORY_RETRIEVE_TOOL_NAME:
        return <MCPAgentMemoryRetrieveActionDetails {...props} />;
      case AGENT_MEMORY_RECORD_TOOL_NAME:
        return <MCPAgentMemoryRecordActionDetails {...props} />;
      case AGENT_MEMORY_ERASE_TOOL_NAME:
        return <MCPAgentMemoryEraseActionDetails {...props} />;
      case AGENT_MEMORY_COMPACT_TOOL_NAME:
      case AGENT_MEMORY_EDIT_TOOL_NAME:
        return (
          <MCPAgentMemoryEditActionDetails {...props} toolName={toolName} />
        );
    }
  }

  if (internalMCPServerName === "toolsets") {
    switch (toolName) {
      case TOOLSETS_ENABLE_TOOL_NAME:
        return <MCPToolsetsEnableActionDetails {...props} />;
      case TOOLSETS_LIST_TOOL_NAME:
        return <MCPListToolsActionDetails {...props} />;
    }
  }

  if (
    internalMCPServerName === "skill_management" &&
    toolName === ENABLE_SKILL_TOOL_NAME
  ) {
    return <MCPSkillEnableActionDetails {...props} />;
  }

  if (internalMCPServerName === "agent_management") {
    return <MCPAgentManagementActionDetails {...props} />;
  }

  if (internalMCPServerName === "data_warehouses") {
    switch (toolName) {
      case DATA_WAREHOUSES_FIND_TOOL_NAME:
      case DATA_WAREHOUSES_LIST_TOOL_NAME:
        return <MCPDataWarehousesBrowseDetails {...props} />;
      case DATA_WAREHOUSES_DESCRIBE_TABLES_TOOL_NAME:
        return <MCPGetDatabaseSchemaActionDetails {...props} />;
      case DATA_WAREHOUSES_QUERY_TOOL_NAME:
        return <MCPTablesQueryActionDetails {...props} />;
    }
  }

  if (
    internalMCPServerName === "conversation_files" &&
    toolName === CONVERSATION_CAT_FILE_ACTION_NAME
  ) {
    return <MCPConversationCatFileDetails {...props} />;
  }

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
    />
  );
}
