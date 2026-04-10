import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  IncludeInputSchema,
  SearchWithNodesInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_MANAGER_SERVER_NAME = "project_manager" as const;

export const PROJECT_MANAGER_TOOLS_METADATA = createToolsRecord({
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
          "MIME type (default: inferred from file extension, e.g. text/markdown for .md files, or text/plain if unknown. Inherited from sourceFileId if provided)"
        ),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to add the file to, will fallback to the conversation's project."
        ),
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
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to update the file in, will fallback to the conversation's project."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating file in project",
      done: "Update file in project",
    },
  },
  attach_to_conversation: {
    description:
      "Attach an existing project context file to the current conversation without creating or copying a new file.",
    schema: {
      fileId: z
        .string()
        .describe("ID of an existing file in the project context to attach"),
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to attach the file to, will fallback to the conversation's project."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Attaching project file to conversation",
      done: "Attach project file to conversation",
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
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to edit the description of, will fallback to the conversation's project."
        ),
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
      dustProject: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
      ]
        .optional()
        .describe(
          "Optional project to get information from, will fallback to the conversation's project."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting project information",
      done: "Get project information",
    },
  },
  retrieve_recent_documents: {
    description:
      "Fetch the most recent documents from this project's knowledge data source (full project scope) and from any content nodes linked in the project context, in reverse chronological order up to the retrieval limit. Respects optional time window. Does not use tag filters.",
    schema: {
      timeFrame: IncludeInputSchema.shape.timeFrame,
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving recent project documents",
      done: "Retrieve recent project documents",
    },
  },
  semantic_search: {
    description:
      "Semantic search over this project using the same retrieval pipeline as company data search. Scope selects the project dust_project data source slice (knowledge vs conversation transcripts vs both) plus searchable context nodes for knowledge/all. Optionally restrict to subtrees using nodeIds (same as company data_sources_file_system search).",
    schema: {
      query: z
        .string()
        .describe(
          "Natural-language query; include enough context from the conversation for good retrieval."
        ),
      searchScope: z
        .enum(["knowledge", "conversations", "all"])
        .optional()
        .describe(
          "knowledge: project files, metadata, and linked searchable nodes (excludes conversation transcripts in the project data source); conversations: only those transcripts; all: entire project data source plus linked nodes (default when omitted)."
        ),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .optional()
        .describe(
          "Restrict matches by document time (same as company search): `all`, or `{k}h|d|w|m|y`. Omit for all time."
        ),
      nodeIds: SearchWithNodesInputSchema.shape.nodeIds,
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching project",
      done: "Search project",
    },
  },
});

const PROJECT_MANAGER_INSTRUCTIONS =
  "Project files and metadata are shared across all conversations in this project. " +
  "Only text-based files are supported for adding/updating. " +
  "You can add/update files by providing text content directly, or by copying from existing files (like those you've generated). " +
  "You can also attach an existing project context file to the current conversation without recreating it. " +
  "Use semantic_search to find relevant chunks in project knowledge and/or conversations (scope: knowledge, conversations, or all). " +
  "Use retrieve_recent_documents to load recent content from the project data source and from knowledge nodes in the project context. " +
  "Requires write permissions on the project space. " +
  "After adding or updating files, always list the file names you changed in your response so the user knows exactly what was modified.";

export const PROJECT_MANAGER_SERVER = {
  // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
  serverInfo: {
    name: "project_manager",
    version: "1.0.0",
    description:
      "Manage project files and metadata. Add, update, list files, and organize project resources.",
    icon: "ActionDocumentTextIcon",
    authorization: null,
    documentationUrl: null,
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
