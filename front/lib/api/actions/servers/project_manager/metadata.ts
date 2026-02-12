// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const PROJECT_MANAGER_SERVER_NAME = "project_manager" as const;

export const PROJECT_MANAGER_TOOLS_METADATA = createToolsRecord({
  list_files: {
    description:
      "List all files in the project context. Returns file metadata including names, IDs, and content types.",
    schema: {
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing project files",
      done: "List project files",
    },
  },
  add_file: {
    description:
      "Add a new file to the project context. The file will be available to all conversations in this project. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    schema: {
      fileName: z.string().describe("Name of the file to add"),
      content: z
        .string()
        .optional()
        .describe(
          "Text content of the file (provide either this or sourceFileId)"
        ),
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
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Adding file to project",
      done: "Add file to project",
    },
  },
  update_file: {
    description:
      "Update the content of an existing file in the project context. This replaces the entire file content. " +
      "Provide either 'content' (text string) or 'sourceFileId' (ID of an existing file from the conversation to copy from).",
    schema: {
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
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating file in project",
      done: "Update file in project",
    },
  },
  edit_description: {
    description:
      "Edit the project description. Only plain text is accepted (no markdown, HTML, or formatting). Descriptions should be brief and concise.",
    schema: {
      description: z
        .string()
        .describe(
          "New project description. Must be plain text only (no markdown, HTML, or other formatting). Keep it brief and concise: 1-2 short sentences max."
        ),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Editing project description",
      done: "Edit project description",
    },
  },
  get_information: {
    description:
      "Get comprehensive information about the project context, including project URL, description, file count, and file list.",
    schema: {
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting project information",
      done: "Get project information",
    },
  },
  search_unread: {
    description:
      "Search for unread conversations in the project. Returns conversations that have been updated since the user last read them, " +
      "within an optional time window (defaults to 30 days).",
    schema: {
      daysBack: z
        .number()
        .optional()
        .default(30)
        .describe(
          "Number of days to look back for unread conversations (default: 30 days)"
        ),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe(
          "Maximum number of conversations to return (default: 20, max: 100)"
        ),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching unread conversations",
      done: "Search unread conversations",
    },
  },
});

const PROJECT_MANAGER_INSTRUCTIONS =
  "Project files and metadata are shared across all conversations in this project. " +
  "Only text-based files are supported for adding/updating. " +
  "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated). " +
  "Requires write permissions on the project space.";

export const PROJECT_MANAGER_SERVER = {
  serverInfo: {
    name: "project_manager",
    version: "1.0.0",
    description:
      "Manage project files and metadata. Add, update, list files, and organize project resources.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
    // These instructions do not belong on the server, they should either be bundled on the
    // instructions since always added programmatically or bundled in a skill.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions: PROJECT_MANAGER_INSTRUCTIONS,
  },
  tools: Object.values(PROJECT_MANAGER_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_MANAGER_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
