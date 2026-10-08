import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CAT_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { z } from "zod";

export const DOCUMENTS_SERVER_NAME = "documents" as const;
export const DOCUMENTS_ADD_COMMENT_ACTION_NAME = "add_comment" as const;
export const DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME =
  "reply_to_comment" as const;
export const DOCUMENTS_READ_DOCUMENT_ACTION_NAME = "read_document" as const;
export const DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME = "edit_document" as const;

export const READ_DOCUMENT_MAX_BYTES = 50 * 1024;

const PATH_SCHEMA = z
  .string()
  .describe(
    `Scoped path of the Markdown document as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`pod-<id>/spec.md\`).`
  );

const COMMENT_BODY_DESCRIPTION =
  "No line may start with `::`. To propose new wording for the commented passage, add a " +
  "fenced code block whose language is `suggestion` holding the Markdown that replaces exactly " +
  "the commented passage (not the sentence around it), empty to delete it. Mention a user with " +
  "`:mention_user[Name]{sId=<user id>}`.";

export const DOCUMENTS_TOOLS_METADATA = [
  {
    name: DOCUMENTS_ADD_COMMENT_ACTION_NAME,
    description:
      "Add a comment to a Markdown document, anchored on a quoted passage of its text. " +
      "The comment opens a new thread attributed to you, signed by Dust so readers see it as " +
      "verified, and shows next to the quoted passage in the document editor. " +
      `Read the document first with \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_READ_DOCUMENT_ACTION_NAME)}\` ` +
      "and quote its Markdown source exactly as returned, syntax included (such as `**` or " +
      "link targets) but leaving out existing `:comment-start{…}` and `:comment-end{…}` " +
      "anchors; a quote cannot span code. " +
      "Never write comment directives by hand with a file edit: they would read as unverified.",
    schema: {
      path: PATH_SCHEMA,
      quote: z
        .string()
        .min(1)
        .describe(
          "Exact Markdown source of the passage to comment on, as returned by reading the document."
        ),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Which occurrence of `quote` to comment on when it appears several times (default 1)."
        ),
      comment: z
        .string()
        .trim()
        .min(1)
        .describe(`The comment, in Markdown. ${COMMENT_BODY_DESCRIPTION}`),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Commenting on document",
      done: "Commented on document",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
    description:
      "Reply in an existing comment thread of a Markdown document, such as one that mentions " +
      "you. The reply is attributed to you, signed by Dust so readers see it as verified, and " +
      "shows under the thread's last message in the document editor, and reopens the thread " +
      "if it was resolved. " +
      "Never write comment directives by hand with a file edit: they would read as unverified.",
    schema: {
      path: PATH_SCHEMA,
      comment_id: z
        .string()
        .min(1)
        .describe(
          "Id of the comment thread to reply in, as given where the comment was shared with you."
        ),
      reply: z
        .string()
        .trim()
        .min(1)
        .describe(`The reply, in Markdown. ${COMMENT_BODY_DESCRIPTION}`),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Replying to comment",
      done: "Replied to comment",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DOCUMENTS_READ_DOCUMENT_ACTION_NAME,
    description:
      "Read a Markdown document in full, as the document editor and its other readers see it. " +
      "Returns its source: front matter, the body with its `:comment-start{…}` / " +
      "`:comment-end{…}` anchors, and the `:::annotations` block holding the comment threads. " +
      `Read the document with this tool before \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME)}\` ` +
      `or \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_ADD_COMMENT_ACTION_NAME)}\`, ` +
      "since someone may be editing it. " +
      `Documents larger than ${READ_DOCUMENT_MAX_BYTES / 1024} KB are refused; read them in parts with ` +
      `\`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\`.`,
    schema: {
      path: PATH_SCHEMA,
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading document",
      done: "Read document",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME,
    description:
      "Edit the body of a Markdown document by replacing an exact string match with new text. " +
      "Use this tool, not a file edit, for documents people may have open in the document editor. " +
      `Match \`old_string\` against the source returned by \`${getPrefixedToolName(DOCUMENTS_SERVER_NAME, DOCUMENTS_READ_DOCUMENT_ACTION_NAME)}\`, ` +
      "character for character. Only the body can change: not the front matter, and not the " +
      "`:::annotations` block, whose threads are changed with the comment tools. Keep every " +
      "`:comment-start{…}` / `:comment-end{…}` anchor pair intact and never write new ones. " +
      "Fails if `old_string` is not found or if the number of occurrences does not match " +
      "`expected_replacements` (default 1); make `old_string` unique by including surrounding text. " +
      "To add text, include the neighboring text in `old_string` and repeat it in `new_string`. " +
      "To write a document whose body is empty, pass an empty `old_string`.",
    schema: {
      path: PATH_SCHEMA,
      old_string: z
        .string()
        .describe(
          "Exact text to replace, matching the document body character for character. Empty " +
            "only to write the body of a document whose body is empty."
        ),
      new_string: z.string().describe("Text to replace `old_string` with."),
      expected_replacements: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Number of occurrences expected to be replaced (default 1). The edit fails if the actual count differs."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Editing document",
      done: "Edited document",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

/** Whether the tool changes the file at its `path`, so a client showing it must refetch. */
export function isDocumentsWritingTool(toolName: string): boolean {
  return (
    toolName === DOCUMENTS_ADD_COMMENT_ACTION_NAME ||
    toolName === DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME ||
    toolName === DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME
  );
}

export const DOCUMENTS_SERVER = {
  serverInfo: {
    name: DOCUMENTS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Collaborate on Markdown documents in the file system alongside their human editors.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
  },
  tools: DOCUMENTS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
