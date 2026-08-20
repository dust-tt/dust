import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  FRAME_SOURCE_MAX_BYTES,
  INTERACTIVE_CONTENT_SERVER_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { BYTE_OFFSET_SCHEMA } from "@app/lib/api/files/text_file_pagination";
import { FILE_PREVIEW_DIRECTIVE_EXAMPLE } from "@app/lib/markdown/file_preview";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import { z } from "zod";

export const FILES_SERVER_NAME = "files" as const;
export const FILES_LIST_ACTION_NAME = "list" as const;
export const FILES_CAT_ACTION_NAME = "cat" as const;
export const FILES_GREP_ACTION_NAME = "grep" as const;
export const FILES_CREATE_ACTION_NAME = "create" as const;
export const FILES_EDIT_ACTION_NAME = "edit" as const;
export const FILES_UPLOAD_FROM_URL_ACTION_NAME = "upload_from_url" as const;
export const FILES_DELETE_ACTION_NAME = "delete" as const;
export const FILES_COPY_ACTION_NAME = "copy" as const;
export const FILES_MOVE_ACTION_NAME = "move" as const;
export const FILES_RESOLVE_ACTION_NAME = "resolve" as const;
export const FILES_EXTRACT_TEXT_ACTION_NAME = "extract_text" as const;

export const CAT_LINES_DEFAULT = 200;
export const CAT_LINES_MAX = 500;
export const GREP_MATCHES_MAX = 50;
export const CREATE_CONTENT_MAX_BYTES = 50 * 1024; // 50 KB (~12K tokens).

const FRAME_FILES_UNSUPPORTED = `Does not support Frame files (\`${frameContentType}\`, \`${frameSlideshowContentType}\`)`;

// Shared `list` description that opens with the generic file-system listing capability and is
// followed by a context-specific suffix injected by the conversation-only or pod-aware
// metadata.
const LIST_DESCRIPTION_PREFIX =
  "List files in the file system. " +
  "Returns one entry per file with its scoped path (e.g. `conversation-<id>/chart.png`), " +
  "content type, and size in KB. " +
  "Scoped paths can be used to reference or display a file in a response, " +
  "or passed to other tools that accept a file path. " +
  "Processed siblings (e.g. audio transcripts) are listed alongside their source with an annotation.";

const SCOPED_PATH_HINT =
  "Paths use `conversation-<id>/...` or `pod-<id>/...` for any conversation or Pod you can access; " +
  "defaults target the current conversation and its Pod when applicable.";

const FILE_PREVIEW_DIRECTIVE_HINT =
  "To show a previewable file citation for a scoped file path in a final response, " +
  `output the markdown directive \`${FILE_PREVIEW_DIRECTIVE_EXAMPLE}\`. ` +
  "Always include `contentType` exactly as returned by this server; it is required to open Frame files in the side panel. " +
  "The rendered citation opens Frame files in the side panel and other files in the file preview, where the user can download them. " +
  "Use the scoped path exactly as returned by this server and never invent an app URL for it.";

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
    `${FILE_PREVIEW_DIRECTIVE_HINT} ` +
    'Defaults to the current conversation\'s files. Omit `scope` or pass `{ type: "conversation" }`. ' +
    'Pass `{ type: "pod" }` to list a Pod\'s shared files. ' +
    "Optional `conversation_id` or `pod_id` on the matching variant list another accessible scope.",
  schema: {
    scope: LIST_SCOPE_SCHEMA.optional().describe(
      "Which file system to list. Omit to list the current conversation."
    ),
  },
  stake: "never_ask" as const,
  eager: true,
  displayLabels: {
    running: "Listing available files",
    done: "Listed available files",
  },
  toolCostCategory: "basic" as const,
  freeUsage: true,
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
  toolCostCategory: "basic" as const,
  freeUsage: true,
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
  toolCostCategory: "basic" as const,
  freeUsage: true,
};

const FILES_TOOLS_COMMON_METADATA = [
  {
    name: FILES_RESOLVE_ACTION_NAME,
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
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
  {
    name: FILES_CAT_ACTION_NAME,
    description:
      "Read the content of a file. " +
      "For text files, reads line by line, returning each line with its line number. " +
      "Use `offset` to start at a specific line and `limit` to control how many lines to return. " +
      "When more content remains, the footer provides the `byte_offset` to pass back (without `offset`) " +
      "to continue from the exact position where the response stopped, even inside an oversized line. " +
      "For images (JPEG, PNG, GIF), returns a vision block the model can inspect directly. " +
      "For binary documents (PDF, DOCX, PPTX, etc.), call " +
      `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_EXTRACT_TEXT_ACTION_NAME)}\` first to extract their text content.`,
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
        .describe(
          "Line number to start reading from (1-indexed, default 1). Use for direct jumps to a line; " +
            "continuation footers provide `byte_offset` instead. Ignored when `byte_offset` is provided."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(CAT_LINES_MAX)
        .optional()
        .describe(
          `Maximum number of lines to return (default ${CAT_LINES_DEFAULT}, max ${CAT_LINES_MAX})`
        ),
      byte_offset: BYTE_OFFSET_SCHEMA,
    },
    stake: "never_ask" as const,
    eager: true,
    displayLabels: {
      running: "Reading file",
      done: "Read file",
    },
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
  {
    name: FILES_GREP_ACTION_NAME,
    description:
      "Search a text file for lines matching a regular expression pattern. " +
      "Returns each matching line with its number, which you can pass to " +
      `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` to read surrounding context. ` +
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
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
  {
    name: FILES_CREATE_ACTION_NAME,
    description:
      "Create or overwrite a file in a conversation or Pod file system. " +
      "Accepts UTF-8 text content only. Binary files cannot be created via this tool. " +
      `Content is capped at ${CREATE_CONTENT_MAX_BYTES / 1024} KB, or ` +
      `${FRAME_SOURCE_MAX_BYTES / 1024} KB when overwriting an existing Frame source file. ` +
      "If the file already exists it is silently overwritten (shell \`>\` semantics); for " +
      `partial changes to an existing file, prefer \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_EDIT_ACTION_NAME)}\` ` +
      "over resending the full content. " +
      "A new file written with a Frame content type is only a source file on the mount. To turn " +
      `it into a shareable rendered Frame, use \`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\` ` +
      "with mode='template' and this path as source, but never do this for a Frame that " +
      "already exists. " +
      "Overwriting an existing Frame file updates only its source, never the rendered Frame " +
      "directly. " +
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
    eager: true,
    displayLabels: {
      running: "Writing file",
      done: "Write file",
    },
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
  {
    name: FILES_UPLOAD_FROM_URL_ACTION_NAME,
    description:
      "Download a file from a public HTTPS URL and store it in a conversation or Pod file system. " +
      "Use this for binary files (PDF, images, spreadsheets, etc.) that cannot be created with " +
      `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CREATE_ACTION_NAME)}\`. ` +
      "If the file already exists it is silently overwritten. " +
      `${FRAME_FILES_UNSUPPORTED}. ` +
      "Returns whether the file was created or updated, along with its path and size.",
    schema: {
      path: z
        .string()
        .describe(
          "Scoped destination path (e.g. `conversation-<id>/report.pdf`, `pod-<id>/assets/logo.png`)"
        ),
      url: z
        .string()
        .url()
        .refine((u) => u.startsWith("https://"), {
          message: "Only public HTTPS URLs are supported.",
        })
        .describe("Public HTTPS URL of the file to download and store"),
      content_type: z
        .string()
        .optional()
        .describe(
          "Optional MIME content type override when the remote server does not send a reliable Content-Type header"
        ),
    },
    stake: "never_ask" as const,
    displayLabels: {
      running: "Uploading file from URL",
      done: "Uploaded file from URL",
    },
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
  {
    name: FILES_DELETE_ACTION_NAME,
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
    stake: "low" as const,
    displayLabels: {
      running: "Deleting file",
      done: "Deleted file",
    },
    toolCostCategory: "basic" as const,
    freeUsage: true,
  },
] as const;

const EDIT_TOOL = {
  description:
    "Edit a text file by replacing an exact string match with new content. " +
    "This is also how to update an existing Frame (interactive dashboard, data visualization, " +
    "chart, or slideshow): make targeted edits to the Frame's source file, then publish it with " +
    `\`${getPrefixedToolName(INTERACTIVE_CONTENT_SERVER_NAME, PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME)}\`. ` +
    "Never create a new Frame or rewrite the whole source to change an existing one. " +
    "`old_string` must match the file content exactly, including whitespace and indentation. " +
    "Fails if `old_string` is not found or if the number of occurrences does not match " +
    "`expected_replacements` (default 1); make `old_string` unique by including surrounding lines. " +
    "To make several changes to the same file in one call, pass `edits` (instead of " +
    "`old_string`/`new_string`): an array of replacements applied in order, each matching against " +
    "the result of the previous ones. The batch is all-or-nothing: if any edit fails to match, " +
    "the file is left untouched. " +
    "Success messages include the resulting line count and a sha256 prefix of the final content. " +
    `Files larger than ${CREATE_CONTENT_MAX_BYTES / 1024} KB cannot be edited with this tool, ` +
    `except Frame source files, which get a higher, ${FRAME_SOURCE_MAX_BYTES / 1024} KB cap. ` +
    "Editing a Frame source file updates only its source, never the rendered Frame directly.",
  schema: {
    path: z
      .string()
      .describe(
        `Scoped file path as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`conversation-<id>/App.tsx\`)`
      ),
    old_string: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Exact text to replace, matching the file content character for character. " +
          "Required unless `edits` is provided."
      ),
    new_string: z
      .string()
      .optional()
      .describe(
        "Text to replace `old_string` with. Required unless `edits` is provided."
      ),
    expected_replacements: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Number of occurrences expected to be replaced (default 1). The edit fails if the actual count differs."
      ),
    edits: z
      .array(
        z.object({
          old_string: z
            .string()
            .min(1)
            .describe(
              "Exact text to replace, matching the file content (as transformed by the previous edits in the batch) character for character"
            ),
          new_string: z.string().describe("Text to replace `old_string` with"),
          expected_replacements: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(
              "Number of occurrences expected to be replaced (default 1). The whole batch fails if the actual count differs."
            ),
        })
      )
      .min(1)
      .optional()
      .describe(
        "Batch of replacements applied in order and written all-or-nothing: either every edit " +
          "matches and the file is written once, or nothing is written. " +
          "Use instead of `old_string`/`new_string` for multi-step changes, never alongside them."
      ),
  },
  stake: "never_ask" as const,
  // Editing a file is a common case, so it's worth keeping this in the cached prefix instead
  // of behind tool search.
  eager: true,
  displayLabels: {
    running: "Editing file",
    done: "Edited file",
  },
  toolCostCategory: "basic" as const,
  freeUsage: true,
};

const EXTRACT_TEXT_TOOL = {
  description:
    "Extract text from a binary document (PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS) " +
    "and save the result as a plain-text file next to the source. " +
    "Returns the scoped path of the extracted file. " +
    `Use this before \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` or \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_GREP_ACTION_NAME)}\` ` +
    "on binary documents that cannot be read as text. " +
    "Do NOT use on plain-text files (.txt, .md, .csv, etc.), read those directly.",
  schema: {
    path: z
      .string()
      .describe(
        `Scoped path to the binary document (e.g. \`conversation-<id>/report.pdf\`)`
      ),
  },
  stake: "never_ask" as const,
  eager: true,
  displayLabels: {
    running: "Extracting text from document",
    done: "Extracted text from document",
  },
  toolCostCategory: "basic" as const,
  freeUsage: true,
};

export const FILES_TOOLS_METADATA = [
  { name: FILES_LIST_ACTION_NAME, ...LIST_TOOL },
  ...FILES_TOOLS_COMMON_METADATA,
  { name: FILES_EDIT_ACTION_NAME, ...EDIT_TOOL },
  { name: FILES_EXTRACT_TEXT_ACTION_NAME, ...EXTRACT_TEXT_TOOL },
  { name: FILES_COPY_ACTION_NAME, ...COPY_TOOL },
  { name: FILES_MOVE_ACTION_NAME, ...MOVE_TOOL },
] as const;

export const FILES_SERVER = {
  serverInfo: {
    name: FILES_SERVER_NAME,
    version: "1.0.0",
    description:
      "File system interface for the agent loop conversation and any accessible conversation or Pod. " +
      "Defaults to the current conversation (and its Pod when applicable). " +
      "Files include user uploads, sandbox outputs, and tool results. " +
      "Scoped paths such as `conversation-<id>/chart.png` or `pod-<id>/spec.md` identify files " +
      "and can be used to reference or display them in responses. " +
      "Processed siblings (resized images, audio transcripts) are listed alongside their source with an annotation.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
  },
  tools: FILES_TOOLS_METADATA,
} as const satisfies ServerMetadata;
