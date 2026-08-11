import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { InteractiveContentFileContentType } from "@app/types/files";
import {
  frameContentType,
  frameSlideshowContentType,
  INTERACTIVE_CONTENT_FILE_FORMATS,
} from "@app/types/files";
import { z } from "zod";

export const INTERACTIVE_CONTENT_SERVER_NAME = "interactive_content" as const;

// Frame sources can legitimately be large, e.g. a server-fetched template.
export const FRAME_SOURCE_MAX_BYTES = 1 * 1024 * 1024; // 1MB

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
const EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "export_interactive_content_file";
export const PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME =
  "publish_interactive_content_file";

// Shared rationale for why an existing Frame must be edited in place rather than recreated.
// Interpolated verbatim wherever this constraint is taught (this server's create tool, the
// files server's create/edit tools, the Frames skill instructions) so the "why" stays a single
// source of truth instead of independently drifting prose in each place.
export const FRAME_RECREATE_WASTE_RATIONALE =
  "a replacement Frame loses the original's identity and share URL and wastes tokens " +
  "regenerating content that did not change";

export const INTERACTIVE_CONTENT_TOOLS_METADATA = [
  {
    name: CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Create a new Frame: interactive content such as a dashboard, data visualization, or slideshow " +
      "presentation that users can run and interact with, beyond static viewing. Choose 'template' " +
      "mode to base it on an existing knowledge node, or 'inline' mode to provide the content " +
      "directly. Validation (Tailwind, TypeScript) is non-blocking: the file is saved even with " +
      "warnings, which you should fix immediately. Only for a Frame that does not already " +
      "exist: to alter a Frame the conversation already has, go through its source file (see " +
      "the Frames skill instructions) rather than creating a replacement.",
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
        .max(FRAME_SOURCE_MAX_BYTES)
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Edit an existing Frame: change its code, for example to fix a chart, adjust colors, or " +
      "update text and layout. Replaces a specified text segment with new text; each edit creates " +
      "a new version of the Frame. " +
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Read back the current content of an existing Frame by its file ID. " +
      "Use this to inspect a Frame you have previously created or edited, and to identify " +
      "the exact text to replace before an edit.",
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME,
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Export a Frame as a PNG screenshot or PDF document. " +
      "PNG returns a visual snapshot of the rendered frame. " +
      "PDF renders the frame with optional orientation (portrait/landscape for regular frames, " +
      "landscape by default for slideshows). " +
      "A Frame that calls pod functions exports its loading state, not its data: do not use a " +
      "PNG export to verify one — call its functions directly instead.",
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
    toolCostCategory: "basic",
    freeUsage: false,
  },
  {
    name: PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    description:
      "Publish a Frame from its source files, applying source edits to the live rendered Frame. " +
      "A Frame's source lives on the file system it currently belongs to: by default " +
      "`conversation-<conversationId>/<filename>` (mounted in the Computer at " +
      "`/files/conversation-<conversationId>/<filename>` when the Computer is available), or a " +
      "Pod path such as `pod-<podId>/<AppName>/<AppName>.tsx` for a Frame that is part of a Pod " +
      "app. Edit that file in place rather than duplicating it, then call this to build it into " +
      "the live Frame. It resolves the Frame's dependency tree from the entry file's directory " +
      "(inlining relative imports), validates TypeScript and JSX, then updates the canonical " +
      "Frame so viewers and shares see the new version. A syntax error blocks publishing and is " +
      "reported back so you can fix it. Tailwind warnings are returned but do not block. Pass " +
      "the `file_id` of the Frame and `path` set to the entry file's current scoped path, e.g. " +
      "`conversation-<conversationId>/<filename>`.",
    schema: {
      file_id: z
        .string()
        .describe(
          "The ID of the Frame to publish (e.g. 'fil_abc123'), the canonical Frame you created " +
            "or previously edited via the Frames tools."
        ),
      path: z
        .string()
        .describe(
          "Scoped path of the Frame's entry source file, not just its directory, e.g. " +
            "`conversation-<conversationId>/<filename>`, or " +
            "`pod-<podId>/<AppName>/<AppName>.tsx` for a Frame stored in a Pod's shared space. " +
            "If the file was renamed or moved, use its current path, listing the directory " +
            "first if unsure. This path's directory becomes the bundling root."
        ),
    },
    enableAlerting: true,
    stake: "never_ask",
    displayLabels: {
      running: "Publishing Frame",
      done: "Publish Frame",
    },
    toolCostCategory: "basic",
    freeUsage: false,
  },
] as const;

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
  tools: INTERACTIVE_CONTENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
