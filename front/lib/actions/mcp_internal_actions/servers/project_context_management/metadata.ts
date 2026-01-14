import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const LIST_PROJECT_FILES_TOOL_NAME = "list_project_files";
export const ADD_PROJECT_FILE_TOOL_NAME = "add_project_file";
export const UPDATE_PROJECT_FILE_TOOL_NAME = "update_project_file";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listProjectFilesSchema = {};

export const addProjectFileSchema = {
  fileName: z.string().describe("Name of the file to add"),
  content: z
    .string()
    .optional()
    .describe("Text content of the file (provide either this or sourceFileId)"),
  sourceFileId: z
    .string()
    .optional()
    .describe(
      "ID of an existing file to copy content from (provide either this or content)"
    ),
  contentType: z
    .string()
    .optional()
    .describe(
      "MIME type (default: text/plain, or inherited from sourceFileId if provided)"
    ),
};

export const updateProjectFileSchema = {
  fileId: z.string().describe("ID of the file to update"),
  content: z
    .string()
    .optional()
    .describe(
      "New text content for the file (provide either this or sourceFileId)"
    ),
  sourceFileId: z
    .string()
    .optional()
    .describe(
      "ID of an existing file to copy content from (provide either this or content)"
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const PROJECT_CONTEXT_MANAGEMENT_TOOLS: MCPToolType[] = [
  {
    name: LIST_PROJECT_FILES_TOOL_NAME,
    description:
      "List all files in the project context. Returns file metadata including names, IDs, and content types.",
    inputSchema: zodToJsonSchema(
      z.object(listProjectFilesSchema)
    ) as JSONSchema,
  },
  {
    name: ADD_PROJECT_FILE_TOOL_NAME,
    description:
      "Add a new file to the project context. The file will be available to all conversations in this project. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    inputSchema: zodToJsonSchema(z.object(addProjectFileSchema)) as JSONSchema,
  },
  {
    name: UPDATE_PROJECT_FILE_TOOL_NAME,
    description:
      "Update the content of an existing file in the project context. This replaces the entire file content. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    inputSchema: zodToJsonSchema(
      z.object(updateProjectFileSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const PROJECT_CONTEXT_MANAGEMENT_SERVER_INFO = {
  name: "project_context_management" as const,
  version: "1.0.0",
  description:
    "Manage files in the project context. Add, update, delete, and list project files.",
  icon: "ActionDocumentTextIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions:
    "Project context files are shared across all conversations in this project. " +
    "Only text-based files are supported for adding/updating. " +
    "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated). " +
    "Requires write permissions on the project space.",
};
