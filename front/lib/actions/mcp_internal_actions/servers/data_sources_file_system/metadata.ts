import { DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const DATA_SOURCES_FILE_SYSTEM_SERVER_INFO = {
  name: "data_sources_file_system" as const,
  version: "1.0.0",
  description: "Browse and search content with filesystem-like navigation.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: DATA_SOURCE_FILESYSTEM_SERVER_INSTRUCTIONS,
};
