// Stored in a separate file to prevent a circular dependency issue.

// Use top_k of 768 as 512 worked really smoothly during initial tests. Might update to 1024 in the
// future based on user feedback.
export const PROCESS_ACTION_TOP_K = 768;

export const DEFAULT_BROWSE_ACTION_NAME = "browse";
export const DEFAULT_BROWSE_ACTION_DESCRIPTION =
  "Browse the content of a web page";

export const DEFAULT_PROCESS_ACTION_NAME =
  "extract_structured_data_from_data_sources";

export const DEFAULT_RETRIEVAL_ACTION_NAME = "search_data_sources";

export const DEFAULT_RETRIEVAL_NO_QUERY_ACTION_NAME = "include_data_sources";

export const DEFAULT_WEBSEARCH_ACTION_NAME = "web_search";
export const DEFAULT_WEBSEARCH_ACTION_DESCRIPTION = "Perform a web search";

export const DEFAULT_TABLES_QUERY_ACTION_NAME = "query_tables";

export const DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME =
  "list_conversation_files";

export const DEFAULT_SEARCH_LABELS_ACTION_NAME = "search_labels";

export const DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME =
  "include_conversation_file";
export const DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_DESCRIPTION = `Retrieve and read an 'includable' conversation file as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``;

export const DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME =
  "query_conversation_tables";
export const DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_DATA_DESCRIPTION = `The tables associated with the 'queryable' conversation files as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``;

export const DEFAULT_CONVERSATION_SEARCH_ACTION_NAME =
  "search_conversation_files";
export const DEFAULT_CONVERSATION_SEARCH_ACTION_DATA_DESCRIPTION = `Search within the 'searchable' conversation files as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``;

export const DUST_CONVERSATION_HISTORY_MAGIC_INPUT_KEY =
  "__dust_conversation_history";

export const DEFAULT_REASONING_ACTION_NAME = "advanced_reasoning";
export const DEFAULT_REASONING_ACTION_DESCRIPTION =
  "Offload a reasoning-heavy task to to a powerful reasoning model. The reasoning model does not have access to any tools.";

export const DEFAULT_MCP_ACTION_NAME = "mcp";
export const DEFAULT_MCP_ACTION_VERSION = "1.0.0";
export const DEFAULT_MCP_ACTION_DESCRIPTION =
  "Call a tool to answer a question.";
export const DEFAULT_MCP_ACTION_ICON = "command";
