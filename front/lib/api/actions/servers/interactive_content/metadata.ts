import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { InteractiveContentFileContentType } from "@app/types/files";
import {
  frameContentType,
  frameSlideshowContentType,
  INTERACTIVE_CONTENT_FILE_FORMATS,
} from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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
export const EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "export_interactive_content_file";

export const INTERACTIVE_CONTENT_TOOLS_METADATA = createToolsRecord({
  [CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Create a new Frame: interactive content such as a dashboard, data visualization, or slideshow " +
      "presentation that users can run and interact with, beyond static viewing. Choose 'template' " +
      "mode to base it on an existing knowledge node, or 'inline' mode to provide the content " +
      "directly. Validation (Tailwind, TypeScript) is non-blocking: the file is saved even with " +
      "warnings, which you should fix immediately.",
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
            `'${frameContentType}' for visualizations and dashboards. Use ` +
            `'${frameSlideshowContentType}' for presentations and slideshows.`
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
          "When mode='template': a reference to an existing document to use as a template. " +
            "Accepts either a knowledge base node ID or a scoped file system path " +
            "(e.g. `pod-<id>/templates/my_template.tsx` or `conversation-<id>/my_template.tsx`). " +
            "Content is fetched server-side without consuming tokens. " +
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
      running: "Creating new Frame",
      done: "Create new Frame",
    },
  },
  [EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Edit an existing Frame: change its code, for example to fix a chart, adjust colors, or " +
      "update text and layout. Replaces a specified text segment with new text; each edit creates " +
      "a new version. " +
      `Use the ${RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME} tool first to read the current text ` +
      "to replace. `old_string` must match the existing text exactly (including all spacing, " +
      "formatting, and line breaks), with at least 3 lines of surrounding context before and after " +
      "so the match is unique; `new_string` is the exact replacement. Inexact or multiple matches " +
      "fail unless `expected_replacements` is set. Validation (Tailwind, TypeScript) is non-blocking.",
    schema: {
      description: z
        .string()
        .describe(
          "The reason this edit is being made and what it achieves, in a few words. " +
            'Use infinitive verbs (e.g. "Fix chart colors", "Add filtering controls").'
        ),
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
      running: "Updating Frame",
      done: "Update Frame",
    },
  },
  [REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Revert a Frame to its previous version. " +
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
      running: "Reverting changes on Frame",
      done: "Revert changes on Frame",
    },
  },
  [RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Rename a Frame. Use this to change the file name of a Frame while keeping its content unchanged.",
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
      running: "Renaming Frame",
      done: "Rename Frame",
    },
  },
  [RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Read back the current content of an existing Frame by its file ID. " +
      "Use this to inspect a Frame you have previously created " +
      `or edited. Use this tool before calling ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} to ` +
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
      running: "Reading Frame content",
      done: "Read Frame content",
    },
  },
  [GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME]: {
    description:
      "Get the share URL (share link) for a Frame. Returns the share URL if the Frame is " +
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
  [EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME]: {
    description:
      "Export a Frame as a PNG screenshot or PDF document. " +
      "PNG returns a visual snapshot of the rendered frame. " +
      "PDF renders the frame with optional orientation (portrait/landscape for regular frames, " +
      "landscape by default for slideshows).",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to export (e.g., 'fil_abc123')"
        ),
      format: z
        .enum(["png", "pdf"])
        .describe(
          "Export format: 'png' for a screenshot, 'pdf' for a paginated document."
        ),
      orientation: z
        .enum(["portrait", "landscape"])
        .optional()
        .describe(
          "PDF orientation. Only used when format is 'pdf'. " +
            "Defaults to 'landscape' for slideshows and 'portrait' for regular frames."
        ),
    },
    enableAlerting: false,
    stake: "never_ask",
    displayLabels: {
      running: "Exporting Frame",
      done: "Export Frame",
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
