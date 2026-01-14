import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { INTERACTIVE_CONTENT_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/instructions";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { InteractiveContentFileContentType } from "@app/types";
import { frameContentType, INTERACTIVE_CONTENT_FILE_FORMATS } from "@app/types";

// Tool names.
export const CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "create_interactive_content_file";
export const EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "edit_interactive_content_file";
export const RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "retrieve_interactive_content_file";
export const REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "revert_interactive_content_file";
export const RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "rename_interactive_content_file";
export const GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME =
  "get_interactive_content_file_share_url";

// Constants.
export const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const createInteractiveContentFileSchema = {
  file_name: z
    .string()
    .describe(
      "The name of the Interactive Content file to create, including extension (e.g. " +
        "DataVisualization.tsx)"
    ),
  mime_type: z
    .enum(
      Object.keys(INTERACTIVE_CONTENT_FILE_FORMATS) as [
        InteractiveContentFileContentType,
      ]
    )
    .describe(
      "The MIME type for the Interactive Content file. Use " +
        `'${frameContentType}' for Frame components (React/JSX).`
    ),
  content: z
    .string()
    .max(MAX_FILE_SIZE_BYTES)
    .describe(
      "The content for the Interactive Content file. Should be complete and ready for execution or " +
        "interaction."
    ),
  description: z
    .string()
    .optional()
    .describe(
      "Optional description of what this Interactive Content file does (e.g., " +
        "'Interactive data visualization', 'Executable analysis script', " +
        "'Dynamic dashboard')"
    ),
};

export const editInteractiveContentFileSchema = {
  file_id: z
    .string()
    .describe(
      "The ID of the Interactive Content file to update (e.g., 'fil_abc123')"
    ),
  old_string: z
    .string()
    .describe(
      "The exact text to find and replace. Must match the file content exactly, " +
        "including all spacing, formatting, and line breaks. Include surrounding context " +
        "to ensure unique identification of the target text."
    ),
  new_string: z
    .string()
    .describe(
      "The exact text to replace old_string with. Should maintain proper syntax " +
        "and follow best practices for the file type."
    ),
  expected_replacements: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Optional number of expected replacements. Defaults to 1. Use when you want " +
        "to replace multiple identical instances of the same text."
    ),
};

export const revertInteractiveContentFileSchema = {
  file_id: z
    .string()
    .describe(
      "The ID of the Interactive Content file to revert (e.g., 'fil_abc123')"
    ),
};

export const renameInteractiveContentFileSchema = {
  file_id: z
    .string()
    .describe(
      "The ID of the Interactive Content file to rename (e.g., 'fil_abc123')"
    ),
  new_file_name: z
    .string()
    .describe(
      "The new name for the file, including extension (e.g., 'UpdatedChart.tsx')"
    ),
};

export const retrieveInteractiveContentFileSchema = {
  file_id: z
    .string()
    .describe(
      "The ID of the Interactive Content file to retrieve (e.g., 'fil_abc123')"
    ),
};

export const getInteractiveContentFileShareUrlSchema = {
  file_id: z
    .string()
    .describe(
      "The ID of the Interactive Content file to get share URL for (e.g., 'fil_abc123')"
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const INTERACTIVE_CONTENT_TOOLS: MCPToolType[] = [
  {
    name: CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Create a new Interactive Content file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing.",
    inputSchema: zodToJsonSchema(
      z.object(createInteractiveContentFileSchema)
    ) as JSONSchema,
  },
  {
    name: EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Modifies content within an Interactive Content file by substituting specified text segments. " +
      "Each edit creates a new version of the Interactive Content file. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} tool to review the file's ` +
      "existing content prior to executing any text substitution. Requirements: " +
      "1. `old_string` MUST contain the precise literal content for substitution " +
      "(preserving all spacing, formatting, line breaks). " +
      "2. `new_string` MUST contain the exact replacement content maintaining proper syntax. " +
      "3. Include minimum 3 lines of surrounding context BEFORE and AFTER the target " +
      "content for unique identification. " +
      "**Critical:** Multiple matches or inexact matches will cause failure.",
    inputSchema: zodToJsonSchema(
      z.object(editInteractiveContentFileSchema)
    ) as JSONSchema,
  },
  {
    name: REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Resets an Interactive Content file to its previous version. " +
      "Each revert goes back one version in the file's history. ",
    inputSchema: zodToJsonSchema(
      z.object(revertInteractiveContentFileSchema)
    ) as JSONSchema,
  },
  {
    name: RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Rename an Interactive Content file. Use this to change the file name while keeping the content unchanged.",
    inputSchema: zodToJsonSchema(
      z.object(renameInteractiveContentFileSchema)
    ) as JSONSchema,
  },
  {
    name: RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Retrieve the current content of an existing Interactive Content file by its file ID. " +
      "Use this to read back the content of Interactive Content files you have previously created " +
      `or updated. Use this tool before calling ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    inputSchema: zodToJsonSchema(
      z.object(retrieveInteractiveContentFileSchema)
    ) as JSONSchema,
  },
  {
    name: GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME,
    description:
      "Get the share URL for an Interactive Content file. Returns the share URL if the file is " +
      "currently shared.",
    inputSchema: zodToJsonSchema(
      z.object(getInteractiveContentFileShareUrlSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const INTERACTIVE_CONTENT_SERVER_INFO = {
  name: "interactive_content" as const,
  version: "1.0.0",
  description: "Create dashboards, presentations, or any interactive content.",
  authorization: null,
  icon: "ActionFrameIcon" as const,
  documentationUrl: null,
  instructions: INTERACTIVE_CONTENT_INSTRUCTIONS,
};
