import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { InteractiveContentFileContentType } from "@app/types/files";
import {
  frameContentType,
  INTERACTIVE_CONTENT_FILE_FORMATS,
} from "@app/types/files";

export const INTERACTIVE_CONTENT_SERVER_NAME = "interactive_content" as const;

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

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

export const INTERACTIVE_CONTENT_TOOLS_METADATA = createToolsRecord({
  [CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Create a new Interactive Content file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing. Validation (Tailwind, TypeScript) " +
      "is non-blocking: the file is saved even with warnings, which you should fix immediately using " +
      "targeted edits. Supports two creation modes: template-based (fetch content from existing node) " +
      "or inline (provide content directly).",
    schema: {
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
      mode: z
        .enum(["template", "inline"])
        .describe(
          "Creation mode: 'template' to reference an existing content node from knowledge " +
            "(content fetched server-side), or 'inline' to provide content directly."
        ),
      source: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "When mode='template': the ID of an existing content node to use as a template " +
            "(e.g., 'template_node_id'). The node's content will be fetched server-side without consuming tokens. " +
            "When mode='inline': the actual content for the Interactive Content file. " +
            "Should be complete and ready for execution or interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this Interactive Content file does (e.g., " +
            "'Interactive data visualization', 'Executable analysis script', " +
            "'Dynamic dashboard')"
        ),
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Creating new Interactive Content file",
      done: "Create new Interactive Content file",
    },
  },
  [EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Modifies content within an Interactive Content file by substituting specified text segments. " +
      "Each edit creates a new version of the Interactive Content file. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME} tool to review the file's ` +
      "existing content prior to executing any text substitution. Requirements: " +
      "1. `old_string` MUST contain the precise literal content for substitution " +
      "(preserving all spacing, formatting, line breaks). " +
      "2. `new_string` MUST contain the exact replacement content maintaining proper syntax. " +
      "3. Include minimum 3 lines of surrounding context BEFORE and AFTER the target " +
      "content for unique identification. " +
      "**Critical:** Multiple matches or inexact matches will cause failure. " +
      "Validation (Tailwind, TypeScript) is non-blocking: warnings are returned but the edit succeeds.",
    schema: {
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
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Updating Interactive Content file",
      done: "Update Interactive Content file",
    },
  },
  [REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Resets an Interactive Content file to its previous version. " +
      "Each revert goes back one version in the file's history. ",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to revert (e.g., 'fil_abc123')"
        ),
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Reverting Interactive Content file",
      done: "Revert Interactive Content file",
    },
  },
  [RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Rename an Interactive Content file. Use this to change the file name while keeping the content unchanged.",
    schema: {
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
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Renaming Interactive Content file",
      done: "Rename Interactive Content file",
    },
  },
  [RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Retrieve the current content of an existing Interactive Content file by its file ID. " +
      "Use this to read back the content of Interactive Content files you have previously created " +
      `or updated. Use this tool before calling ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to retrieve (e.g., 'fil_abc123')"
        ),
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Reading Interactive Content file",
      done: "Read Interactive Content file",
    },
  },
  [GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME]: {
    description:
      "Get the share URL for an Interactive Content file. Returns the share URL if the file is " +
      "currently shared.",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to get share URL for (e.g., 'fil_abc123')"
        ),
    },
    enableAlerting: false,
    stake: "never_ask",
    displayLabels: {
      running: "Getting share URL",
      done: "Get share URL",
    },
  },
});

export const INTERACTIVE_CONTENT_SERVER = {
  serverInfo: {
    name: "interactive_content",
    version: "1.0.0",
    description:
      "Create dashboards, presentations, or any interactive content.",
    authorization: null,
    icon: "ActionFrameIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(INTERACTIVE_CONTENT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(INTERACTIVE_CONTENT_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
