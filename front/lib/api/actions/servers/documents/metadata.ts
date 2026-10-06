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

export const DOCUMENTS_TOOLS_METADATA = [
  {
    name: DOCUMENTS_ADD_COMMENT_ACTION_NAME,
    description:
      "Add a comment to a Markdown document, anchored on a quoted passage of its text. " +
      "The comment opens a new thread attributed to you, signed by Dust so readers see it as " +
      "verified, and shows next to the quoted passage in the document editor. " +
      `Read the document first with \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` ` +
      "and quote its Markdown source exactly as returned, syntax included (such as `**` or " +
      "link targets) but leaving out existing `:comment-start{…}` and `:comment-end{…}` " +
      "anchors; a quote cannot span code. " +
      "Never write comment directives by hand with a file edit: they would read as unverified.",
    schema: {
      path: z
        .string()
        .describe(
          `Scoped path of the Markdown document as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\` (e.g. \`pod-<id>/spec.md\`).`
        ),
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
        .describe("The comment, in Markdown. No line may start with `::`."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Commenting on document",
      done: "Commented on document",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

/** Whether the tool changes the file at its `path`, so a client showing it must refetch. */
export function isDocumentsWritingTool(toolName: string): boolean {
  return toolName === DOCUMENTS_ADD_COMMENT_ACTION_NAME;
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
