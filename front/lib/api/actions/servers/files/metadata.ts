import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const FILES_SERVER_NAME = "files" as const;
export const FILES_LIST_ACTION_NAME = "list" as const;
export const FILES_CAT_ACTION_NAME = "cat" as const;
export const FILES_GREP_ACTION_NAME = "grep" as const;
export const FILES_CREATE_ACTION_NAME = "create" as const;

export const CAT_LINES_DEFAULT = 200;
export const CAT_LINES_MAX = 500;
export const GREP_MATCHES_MAX = 50;
export const CREATE_CONTENT_MAX_BYTES = 50 * 1024; // 50 KB (~12K tokens).

export const FILES_TOOLS_METADATA = createToolsRecord({
  [FILES_LIST_ACTION_NAME]: {
    description:
      "List all files in the conversation file system. " +
      "Returns one entry per file with its scoped path (e.g. `conversation/chart.png`), " +
      "content type, and size in KB. " +
      "Scoped paths can be used to reference or display a file in a response, " +
      "or passed to other tools that accept a file path.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing available files",
      done: "Listed available files",
    },
  },
  [FILES_CAT_ACTION_NAME]: {
    description:
      "Read the content of a file. " +
      "For text files, returns lines with their line numbers." +
      "Use `offset` to start at a specific line and `limit` to control how many lines to return. " +
      "When the output is truncated, a footer indicates the next offset to use. " +
      "For images (JPEG, PNG, GIF), returns a vision block the model can inspect directly.",
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation/data.csv\`)`
        ),
      offset: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Line number to start reading from (1-indexed, default 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(CAT_LINES_MAX)
        .optional()
        .describe(
          `Maximum number of lines to return (default ${CAT_LINES_DEFAULT}, max ${CAT_LINES_MAX})`
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading file",
      done: "Read file",
    },
  },
  [FILES_GREP_ACTION_NAME]: {
    description:
      "Search a text file for lines matching a regular expression. " +
      "Returns matching lines with their line numbers. " +
      "Use the line numbers with `files__cat` to read surrounding context. " +
      `Results are capped at ${GREP_MATCHES_MAX} matches.`,
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation/data.csv\`)`
        ),
      pattern: z
        .string()
        .describe(
          "Regular expression to search for (case-sensitive; use `(?i)` prefix for case-insensitive)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching file",
      done: "Searched file",
    },
  },
  [FILES_CREATE_ACTION_NAME]: {
    description:
      "Create or overwrite a file in the conversation file system. " +
      "Accepts UTF-8 text content only. Binary files cannot be created via this tool. " +
      `Content is capped at ${CREATE_CONTENT_MAX_BYTES / 1024} KB. ` +
      "If the file already exists it is silently overwritten (shell \`>\` semantics). " +
      "Returns whether the file was created or updated, along with its path and size.",
    schema: {
      path: z
        .string()
        .describe(
          "Scoped file path for the new file (e.g. `conversation/output.json`, `conversation/reports/summary.txt`)"
        ),
      content: z.string().describe("UTF-8 text content to write"),
      content_type: z
        .string()
        .describe(
          "MIME content type (e.g. `text/plain`, `application/json`, `text/csv`, `text/markdown`)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Writing file",
      done: "Write file",
    },
  },
});

export const FILES_SERVER = {
  serverInfo: {
    name: FILES_SERVER_NAME,
    version: "1.0.0",
    description:
      "File system interface scoped to the current conversation. " +
      "Gives the agent visibility into all files present in the conversation: " +
      "files uploaded by the user, files generated during execution (e.g. charts, " +
      "exports, processed data produced by code run in the sandbox), and files produced " +
      "as results of tool use. " +
      "Files are identified by scoped paths such as `conversation/chart.png` that can " +
      "be used to reference, display, or link files in agent responses.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(FILES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FILES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
