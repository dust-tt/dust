// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const PROJECT_CONTEXT_MANAGEMENT_SERVER_NAME =
  "project_context_management" as const;

export const PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA = createToolsRecord({
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
    stake: "high",
    displayLabels: {
      running: "Adding project file",
      done: "Add project file",
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
    stake: "high",
    displayLabels: {
      running: "Updating project file",
      done: "Update project file",
    },
  },
  edit_description: {
    description:
      "Edit the project description. This updates the project's description text.",
    schema: {
      description: z
        .string()
        .describe("New project description (free-form text)."),
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
  add_url: {
    description:
      "Add a new URL to the project. URLs are named links (e.g., documentation, repository, design files).",
    schema: {
      name: z
        .string()
        .describe("Name/label for the URL (e.g., 'Documentation')"),
      url: z.string().describe("The URL to add"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Adding project URL",
      done: "Add project URL",
    },
  },
  edit_url: {
    description:
      "Edit an existing URL in the project. You can change the name and/or the URL itself. " +
      "Identify the URL to edit by its current name.",
    schema: {
      currentName: z.string().describe("Current name/label of the URL to edit"),
      newName: z
        .string()
        .optional()
        .describe("New name/label for the URL (leave empty to keep current)"),
      newUrl: z
        .string()
        .optional()
        .describe("New URL value (leave empty to keep current)"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Editing project URL",
      done: "Edit project URL",
    },
  },
  get_information: {
    description:
      "Get comprehensive information about the project context, including project URL, description, URLs, file count, and file list.",
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
  create_conversation: {
    description:
      "Create a new conversation in the project and post a user message. The message will be sent on behalf of the user executing the tool.",
    schema: {
      message: z
        .string()
        .describe("The message content to post in the new conversation"),
      title: z.string().describe("Title for the conversation"),
      agentId: z
        .string()
        .optional()
        .describe("Optional agent ID to mention in the conversation"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Creating conversation",
      done: "Create conversation",
    },
  },
});

const PROJECT_CONTEXT_MANAGEMENT_INSTRUCTIONS =
  "Project context files are shared across all conversations in this project. " +
  "Only text-based files are supported for adding/updating. " +
  "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated). " +
  "Requires write permissions on the project space.";

export const PROJECT_CONTEXT_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "project_context_management",
    version: "1.0.0",
    description:
      "Manage files in the project context. Add, update, delete, and list project files.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
    instructions: PROJECT_CONTEXT_MANAGEMENT_INSTRUCTIONS,
  },
  tools: Object.values(PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_CONTEXT_MANAGEMENT_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
