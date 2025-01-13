// Stored in a separate file to prevent a circular dependency issue.
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
