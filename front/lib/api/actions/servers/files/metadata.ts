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
export const FILES_DELETE_ACTION_NAME = "delete" as const;
export const FILES_COPY_ACTION_NAME = "copy" as const;
export const FILES_RESOLVE_ACTION_NAME = "resolve" as const;

export const CAT_LINES_DEFAULT = 200;
export const CAT_LINES_MAX = 500;
export const GREP_MATCHES_MAX = 50;
export const CREATE_CONTENT_MAX_BYTES = 50 * 1024; // 50 KB (~12K tokens).

// Shared `list` description that opens with the generic file-system listing capability and is
// followed by a context-specific suffix injected by the conversation-only or project-aware
// metadata.
const LIST_DESCRIPTION_PREFIX =
  "List files in the file system. " +
  "Returns one entry per file with its scoped path (e.g. `conversation/chart.png`), " +
  "content type, and size in KB. " +
  "Scoped paths can be used to reference or display a file in a response, " +
  "or passed to other tools that accept a file path. " +
  "Some files have an auto-generated `*.processed.<ext>` sibling carrying a " +
  "model-friendly representation of their source: a resized version for images, " +
  "a transcript for audio, or extracted text for PDFs and other documents. " +
  `Read the sibling with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` to access the content of binary sources.`;

// `list` tool variants. The conversation-only build takes no parameter and always lists
// conversation files. The project-aware build accepts `scope: "conversation" | "project"` and is
// only registered when the conversation belongs to a project.
const LIST_CONVERSATION_ONLY_TOOL = {
  description: `${LIST_DESCRIPTION_PREFIX} Lists the conversation's files.`,
  schema: {},
  stake: "never_ask" as const,
  displayLabels: {
    running: "Listing available files",
    done: "Listed available files",
  },
};

const LIST_PROJECT_AWARE_TOOL = {
  description:
    `${LIST_DESCRIPTION_PREFIX} ` +
    "Defaults to the conversation's files. Pass `scope: \"project\"` to list the project's " +
    "shared files (visible to every conversation in the same project) instead.",
  schema: {
    scope: z
      .enum(["conversation", "project"])
      .optional()
      .describe(
        "Which file system to list. Defaults to `conversation`. Pass `project` to list the project's shared files."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Listing available files",
    done: "Listed available files",
  },
};

// `copy` tool variants. The conversation-only build keeps the description scoped to within-
// conversation use cases. The project-aware build is registered only in project conversations
// and adds an example of the cross-scope promotion the agent can perform there.
const COPY_DESCRIPTION_BASE =
  "Copy a file between scoped paths, preserving its bytes and content type. " +
  "Useful for duplicating a file without round-tripping the content through the agent, " +
  "which keeps binary files (PDFs, images, audio) intact. " +
  "Overwrites `dest` if it already exists.";

const COPY_CONVERSATION_ONLY_TOOL = {
  description: COPY_DESCRIPTION_BASE,
  schema: {
    source: z
      .string()
      .describe(
        "Scoped path of the file to copy from (e.g. `conversation/report.pdf`)."
      ),
    dest: z
      .string()
      .describe(
        "Scoped path of the destination (e.g. `conversation/archive/report.pdf`)."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Copying file",
    done: "Copied file",
  },
};

const COPY_PROJECT_AWARE_TOOL = {
  description:
    `${COPY_DESCRIPTION_BASE} ` +
    "Since this conversation belongs to a project, you can also copy between scopes, " +
    "e.g. `conversation/report.pdf` -> `project/report.pdf` to promote a file into the project, " +
    "or `project/spec.md` -> `conversation/spec.md` to pull it into the conversation.",
  schema: {
    source: z
      .string()
      .describe(
        "Scoped path of the file to copy from (e.g. `conversation/report.pdf` or `project/spec.md`)."
      ),
    dest: z
      .string()
      .describe(
        "Scoped path of the destination (e.g. `project/report.pdf` or `conversation/archive/report.pdf`)."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Copying file",
    done: "Copied file",
  },
};

// Stake levels in this record are typed via `as const` so the object can be spread into
// `createToolsRecord`, which expects the narrowed `MCPToolStakeLevelType` literal.
const FILES_TOOLS_COMMON_METADATA = {
  [FILES_RESOLVE_ACTION_NAME]: {
    description:
      "Resolve a file ID (e.g. `fil_abc123`) to its scoped file system path " +
      "(e.g. `conversation/report.pdf` or `project/data.csv`). " +
      "Use this when you have a raw file identifier but need the path accepted by other tools " +
      "such as `" +
      getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME) +
      "` or `" +
      getPrefixedToolName(FILES_SERVER_NAME, FILES_GREP_ACTION_NAME) +
      "`.",
    schema: {
      file_id: z
        .string()
        .describe(
          "File identifier starting with `fil_` (e.g. `fil_abc123def456`)"
        ),
    },
    stake: "never_ask" as const,
    displayLabels: {
      running: "Resolving file ID",
      done: "Resolved file ID",
    },
  },
  [FILES_CAT_ACTION_NAME]: {
    description:
      "Read the content of a file. " +
      "For text files, returns lines with their line numbers." +
      "Use `offset` to start at a specific line and `limit` to control how many lines to return. " +
      "When the output is truncated, a footer indicates the next offset to use. " +
      "For images (JPEG, PNG, GIF), returns a vision block the model can inspect directly. " +
      "For binary sources such as PDFs, scanned documents, or audio files, prefer the " +
      `\`*.processed.<ext>\` sibling listed in \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\`. It carries the extracted text or transcript.`,
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
    stake: "never_ask" as const,
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
    stake: "never_ask" as const,
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
    stake: "never_ask" as const,
    displayLabels: {
      running: "Writing file",
      done: "Write file",
    },
  },
  [FILES_DELETE_ACTION_NAME]: {
    description:
      "Delete a file from the conversation file system. " +
      "Returns an error if the file does not exist. Deletion is permanent.",
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation/output.json\`)`
        ),
    },
    stake: "medium" as const,
    displayLabels: {
      running: "Deleting file",
      done: "Deleted file",
    },
  },
};

export const FILES_TOOLS_METADATA = createToolsRecord({
  [FILES_LIST_ACTION_NAME]: LIST_CONVERSATION_ONLY_TOOL,
  ...FILES_TOOLS_COMMON_METADATA,
  [FILES_COPY_ACTION_NAME]: COPY_CONVERSATION_ONLY_TOOL,
});

export const FILES_TOOLS_METADATA_WITH_PROJECT = createToolsRecord({
  [FILES_LIST_ACTION_NAME]: LIST_PROJECT_AWARE_TOOL,
  ...FILES_TOOLS_COMMON_METADATA,
  [FILES_COPY_ACTION_NAME]: COPY_PROJECT_AWARE_TOOL,
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
      "be used to reference, display, or link files in agent responses. " +
      "Files whose name follows the `*.processed.<ext>` pattern are auto-generated " +
      "model-friendly representations of their source (resized image, audio transcript, " +
      "or text extracted from a document). Read those siblings to access the content " +
      "of binary uploads.",
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
