import type { AgentActionPublicType } from "@dust-tt/client";

const SEARCH_TOOL_NAME = "semantic_search";
const INCLUDE_TOOL_NAME = "retrieve_recent_documents";
const WEBSEARCH_TOOL_NAME = "websearch";
const WEBBROWSER_TOOL_NAME = "webbrowser";
const QUERY_TABLES_TOOL_NAME = "query_tables";
const GET_DATABASE_SCHEMA_TOOL_NAME = "get_database_schema";
const EXECUTE_DATABASE_QUERY_TOOL_NAME = "execute_database_query";
const PROCESS_TOOL_NAME = "extract_information_from_documents";
const RUN_AGENT_TOOL_NAME = "run_agent";
const CREATE_AGENT_TOOL_NAME = "create_agent";
const FIND_TAGS_TOOL_NAME = "find_tags";
const FILESYSTEM_CAT_TOOL_NAME = "cat";
const FILESYSTEM_FIND_TOOL_NAME = "find";
const FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME = "locate_in_tree";
const FILESYSTEM_LIST_TOOL_NAME = "list";

export const getActionName = (action: AgentActionPublicType) => {
  const { functionCallName, internalMCPServerName } = action;

  const parts = functionCallName ? functionCallName.split("__") : [];
  const toolName = parts[parts.length - 1];

  if (
    internalMCPServerName === "search" ||
    internalMCPServerName === "data_sources_file_system"
  ) {
    if (toolName === SEARCH_TOOL_NAME) {
      return "Searching";
    }

    if (
      toolName === FILESYSTEM_LIST_TOOL_NAME ||
      toolName === FILESYSTEM_FIND_TOOL_NAME
    ) {
      return "Browsing data sources";
    }

    if (toolName === FILESYSTEM_CAT_TOOL_NAME) {
      return "Viewing data source";
    }

    if (toolName === FILESYSTEM_LOCATE_IN_TREE_TOOL_NAME) {
      return "Locating item";
    }
  }

  if (internalMCPServerName === "include_data") {
    if (toolName === INCLUDE_TOOL_NAME) {
      return "Including data";
    }
  }

  if (internalMCPServerName === "web_search_&_browse") {
    if (toolName === WEBSEARCH_TOOL_NAME) {
      return "Searching the web";
    }
    if (toolName === WEBBROWSER_TOOL_NAME) {
      return "Browsing the web";
    }
  }

  if (internalMCPServerName === "query_tables") {
    if (toolName === QUERY_TABLES_TOOL_NAME) {
      return "Querying tables";
    }
  }

  if (internalMCPServerName === "query_tables_v2") {
    if (toolName === GET_DATABASE_SCHEMA_TOOL_NAME) {
      return "Getting database schema";
    }
    if (toolName === EXECUTE_DATABASE_QUERY_TOOL_NAME) {
      return "Executing database query";
    }
  }

  if (internalMCPServerName === "reasoning") {
    return "Reasoning";
  }

  if (internalMCPServerName === "extract_data") {
    if (toolName === PROCESS_TOOL_NAME) {
      return "Extracting data";
    }
  }

  return "Running a tool";
};
