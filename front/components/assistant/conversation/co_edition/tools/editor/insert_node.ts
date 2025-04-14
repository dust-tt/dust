import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

import { insertNodes } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

const InsertNodeSchema = z.object({
  position: z
    .number()
    .describe("The position where to insert the new node (0-based index)"),
  content: z
    .string()
    .describe(
      "The content for the node. Supports plain text or HTML " +
        "(e.g. '<p>Some <strong>bold</strong> text</p>'). Markdown is not supported."
    ),
});

export function registerInsertNodeTool(server: McpServer, editor: Editor) {
  server.tool(
    "insert_node",
    `Insert a new node at a specific position. IMPORTANT: Use this tool only after
    analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to add new content between existing nodes
    - You want to expand the document with additional information`,
    { params: InsertNodeSchema },
    async ({ params }) => {
      insertNodes(editor, params);

      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted new node at position ${params.position}`,
          },
        ],
      };
    }
  );
}
