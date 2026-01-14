import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";
import type { InteractiveContentFileContentType } from "@app/types";
import { frameContentType, INTERACTIVE_CONTENT_FILE_FORMATS } from "@app/types";

import { SLIDESHOW_INSTRUCTIONS } from "./instructions";

// Tool names.
export const CREATE_SLIDESHOW_FILE_TOOL_NAME = "create_slideshow_file";
export const EDIT_SLIDESHOW_FILE_TOOL_NAME = "edit_slideshow_file";
export const RETRIEVE_SLIDESHOW_FILE_TOOL_NAME = "retrieve_slideshow_file";

// Constants.
export const MAX_SLIDESHOW_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const createSlideshowFileSchema = {
  file_name: z
    .string()
    .describe(
      "The name of the slideshow file to create, including extension (e.g. " +
        "Presentation.tsx)"
    ),
  mime_type: z
    .enum(
      Object.keys(INTERACTIVE_CONTENT_FILE_FORMATS) as [
        InteractiveContentFileContentType,
      ]
    )
    .describe(
      "The MIME type for the slideshow file. Currently supports " +
        `'${frameContentType}' for client-side executable files.`
    ),
  content: z
    .string()
    .max(MAX_SLIDESHOW_FILE_SIZE_BYTES)
    .describe(
      "The content for the slideshow file. Should be complete and ready for viewing. " +
        "Must use the Slideshow component from @dust/slideshow/v1."
    ),
  description: z
    .string()
    .optional()
    .describe(
      "Optional description of what this slideshow does (e.g., " +
        "'Q4 Revenue Analysis', 'Product Tutorial', " +
        "'Team Onboarding Presentation')"
    ),
};

export const editSlideshowFileSchema = {
  file_id: z
    .string()
    .describe("The ID of the slideshow file to update (e.g., 'fil_abc123')"),
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

export const retrieveSlideshowFileSchema = {
  file_id: z
    .string()
    .describe("The ID of the slideshow file to retrieve (e.g., 'fil_abc123')"),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const SLIDESHOW_TOOLS: MCPToolType[] = [
  {
    name: CREATE_SLIDESHOW_FILE_TOOL_NAME,
    description:
      "Create a new slideshow file that users can view and navigate. Use this for " +
      "interactive presentations, tutorials, step-by-step analysis, comparisons, and reports.",
    inputSchema: zodToJsonSchema(
      z.object(createSlideshowFileSchema)
    ) as JSONSchema,
  },
  {
    name: EDIT_SLIDESHOW_FILE_TOOL_NAME,
    description:
      "Modifies content within a slideshow file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${RETRIEVE_SLIDESHOW_FILE_TOOL_NAME} tool to review the file's ` +
      "existing content prior to executing any text substitution. Requirements: " +
      "1. `old_string` MUST contain the precise literal content for substitution " +
      "(preserving all spacing, formatting, line breaks). " +
      "2. `new_string` MUST contain the exact replacement content maintaining proper syntax. " +
      "3. Include minimum 3 lines of surrounding context BEFORE and AFTER the target " +
      "content for unique identification. " +
      "**Critical:** Multiple matches or inexact matches will cause failure.",
    inputSchema: zodToJsonSchema(
      z.object(editSlideshowFileSchema)
    ) as JSONSchema,
  },
  {
    name: RETRIEVE_SLIDESHOW_FILE_TOOL_NAME,
    description:
      "Retrieve the current content of an existing slideshow file by its file ID. " +
      "Use this to read back the content of slideshow files you have previously created or " +
      `updated. Use this tool before calling ${EDIT_SLIDESHOW_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    inputSchema: zodToJsonSchema(
      z.object(retrieveSlideshowFileSchema)
    ) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SLIDESHOW_SERVER_INFO = {
  name: "slideshow" as const,
  version: "0.1.0",
  description: "Create interactive slideshows.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: SLIDESHOW_INSTRUCTIONS,
};
