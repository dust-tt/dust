import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
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
export const FILES_MOVE_ACTION_NAME = "move" as const;
export const FILES_RESOLVE_ACTION_NAME = "resolve" as const;
export const FILES_EXTRACT_TEXT_ACTION_NAME = "extract_text" as const;

export const CAT_LINES_DEFAULT = 200;
export const CAT_LINES_MAX = 500;
export const GREP_MATCHES_MAX = 50;
export const CREATE_CONTENT_MAX_BYTES = 50 * 1024; // 50 KB (~12K tokens).

// Shared `list` description that opens with the generic file-system listing capability and is
// followed by a context-specific suffix injected by the conversation-only or pod-aware
// metadata.
const LIST_DESCRIPTION_PREFIX =
  "List files in the file system. " +
  "Returns one entry per file with its scoped path (e.g. `conversation-<id>/chart.png`), " +
  "content type, and size in KB. " +
  "Scoped paths can be used to reference or display a file in a response, " +
  "or passed to other tools that accept a file path. " +
  "Some files have an auto-generated `*.processed.<ext>` sibling carrying a " +
  "model-friendly representation of their source: a resized version for images, " +
  "or a transcript for audio. " +
  `Read the sibling with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` to access the content of audio uploads.`;

const SCOPED_PATH_HINT =
  "Paths use `conversation-<id>/...` or `pod-<id>/...` for any conversation or Pod you can access; " +
  "defaults target the current conversation and its Pod when applicable.";

const LIST_SCOPE_SCHEMA = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    conversation_id: z
      .string()
      .optional()
      .describe(
        "Conversation id to list. Defaults to the current conversation."
      ),
  }),
  z.object({
    type: z.literal("pod"),
    pod_id: z
      .string()
      .optional()
      .describe(
        "Pod id to list. Defaults to the current conversation's Pod when it has one."
      ),
  }),
]);

const LIST_TOOL = {
  description:
    `${LIST_DESCRIPTION_PREFIX} ` +
    'Defaults to the current conversation\'s files. Omit `scope` or pass `{ type: "conversation" }`. ' +
    'Pass `{ type: "pod" }` to list a Pod\'s shared files. ' +
    "Optional `conversation_id` or `pod_id` on the matching variant list another accessible scope.",
  schema: {
    scope: LIST_SCOPE_SCHEMA.optional().describe(
      "Which file system to list. Omit to list the current conversation."
    ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Listing available files",
    done: "Listed available files",
  },
};

// `copy` tool variants. The conversation-only build keeps the description scoped to within-
// conversation use cases. The pod-aware build is registered only in pod conversations
// and adds an example of the cross-scope promotion the agent can perform there.
const COPY_DESCRIPTION_BASE =
  "Copy a file between scoped paths, keeping the source intact. " +
  `Does not support frame files (\`application/vnd.dust.frame\`); use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_MOVE_ACTION_NAME)}\` for those. ` +
  "Useful for duplicating a file without round-tripping content through the agent. " +
  "Overwrites `dest` if it already exists.";

// `move` tool variants. Move atomically transfers a file (copy + delete source).
// Frame files must be moved rather than copied: copying produces a raw GCS object
// with no FileResource record, breaking interactive rendering.
const MOVE_DESCRIPTION_BASE =
  "Move a file from one scoped path to another, removing the source after a successful transfer. " +
  "Frame files (`application/vnd.dust.frame`) must be moved rather than copied.";

const COPY_TOOL = {
  description:
    `${COPY_DESCRIPTION_BASE} ${SCOPED_PATH_HINT} ` +
    "You can copy across scopes, e.g. `conversation-<id>/report.pdf` -> `pod-<id>/report.pdf` to promote a file into a Pod.",
  schema: {
    source: z
      .string()
      .describe(
        "Scoped path of the file to copy from (e.g. `conversation-<id>/report.pdf` or `pod-<id>/spec.md`)."
      ),
    dest: z
      .string()
      .describe(
        "Scoped path of the destination (e.g. `pod-<id>/report.pdf` or `conversation-<id>/archive/report.pdf`)."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Copying file",
    done: "Copied file",
  },
};

const MOVE_TOOL = {
  description: `${MOVE_DESCRIPTION_BASE} ${SCOPED_PATH_HINT}`,
  schema: {
    source: z
      .string()
      .describe(
        "Scoped path of the file to move (e.g. `conversation-<id>/frame.html` or `pod-<id>/data.csv`)."
      ),
    dest: z
      .string()
      .describe(
        "Scoped path of the destination (e.g. `pod-<id>/frame.html` or `conversation-<id>/archive/data.csv`)."
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Moving file",
    done: "Moved file",
  },
};

// Stake levels in this record are typed via `as const` so the object can be spread into
// `createToolsRecord`, which expects the narrowed `MCPToolStakeLevelType` literal.
const FILES_TOOLS_COMMON_METADATA = {
  [FILES_RESOLVE_ACTION_NAME]: {
    description:
      "Resolve a file ID (e.g. `fil_abc123`) to its scoped file system path " +
      "(e.g. `conversation-<id>/report.pdf` or `pod-<id>/data.csv`). " +
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
      "For binary documents (PDF, DOCX, PPTX, etc.), call " +
      `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_EXTRACT_TEXT_ACTION_NAME)}\` first to extract their text content. ` +
      "For audio files, prefer the `*.processed.<ext>` sibling which carries the transcript.",
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation-<id>/data.csv\`)`
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
      `Use the line numbers with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` to read surrounding context. ` +
      `Results are capped at ${GREP_MATCHES_MAX} matches.`,
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation-<id>/data.csv\`)`
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
      "Create or overwrite a file in a conversation or Pod file system. " +
      "Accepts UTF-8 text content only. Binary files cannot be created via this tool. " +
      `Content is capped at ${CREATE_CONTENT_MAX_BYTES / 1024} KB. ` +
      "If the file already exists it is silently overwritten (shell \`>\` semantics). " +
      "Does not support Frame files (`application/vnd.dust.frame`, " +
      "`application/vnd.dust.frame.slideshow`); use " +
      `\`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\` to create or ` +
      `\`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\` to edit them. ` +
      "Returns whether the file was created or updated, along with its path and size.",
    schema: {
      path: z
        .string()
        .describe(
          "Scoped file path for the new file (e.g. `conversation-<id>/output.json`, `conversation-<id>/reports/summary.txt`)"
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
      "Delete a file from a conversation or Pod file system. " +
      "Returns an error if the file does not exist. Deletion is permanent.",
    schema: {
      path: z
        .string()
        .describe(
          `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation-<id>/output.json\`)`
        ),
    },
    stake: "medium" as const,
    displayLabels: {
      running: "Deleting file",
      done: "Deleted file",
    },
  },
};

const EXTRACT_TEXT_TOOL = {
  description:
    "Extract text from a binary document (PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS) " +
    "and save the result as a plain-text file next to the source. " +
    "Returns the scoped path of the extracted file. " +
    `Use this before \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` or \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_GREP_ACTION_NAME)}\` ` +
    "on binary documents that cannot be read as text.",
  schema: {
    path: z
      .string()
      .describe(
        `Scoped path to the binary document (e.g. \`conversation-<id>/report.pdf\`)`
      ),
  },
  stake: "never_ask" as const,
  displayLabels: {
    running: "Extracting text from document",
    done: "Extracted text from document",
  },
};

export const FILES_TOOLS_METADATA = createToolsRecord({
  [FILES_LIST_ACTION_NAME]: LIST_TOOL,
  ...FILES_TOOLS_COMMON_METADATA,
  [FILES_EXTRACT_TEXT_ACTION_NAME]: EXTRACT_TEXT_TOOL,
  [FILES_COPY_ACTION_NAME]: COPY_TOOL,
  [FILES_MOVE_ACTION_NAME]: MOVE_TOOL,
});

export const FILES_SERVER = {
  serverInfo: {
    name: FILES_SERVER_NAME,
    version: "1.0.0",
    description:
      "File system interface for the agent loop conversation and any accessible conversation or Pod. " +
      "Defaults to the current conversation (and its Pod when applicable). " +
      "Files include user uploads, sandbox outputs, and tool results. " +
      "Scoped paths such as `conversation-<id>/chart.png` or `pod-<id>/spec.md` identify files " +
      "and can be used to reference, display, or link them in responses. " +
      "Files whose name follows the `*.processed.<ext>` pattern are auto-generated " +
      "model-friendly representations of their source (resized image or audio transcript). " +
      "Read those siblings to access the content of audio uploads.",
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
