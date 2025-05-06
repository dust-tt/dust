import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

import { CoEditionContentSchema } from "@app/components/assistant/conversation/co_edition/tools/editor/types";
import {
  contentToHtml,
  getDocumentPositions,
} from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

const InsertNodeSchema = z.object({
  position: z
    .number()
    .describe("The position where to insert the new node (0-based index)"),
  node: CoEditionContentSchema,
});

export function registerInsertNodeTool(server: McpServer, editor: Editor) {
  server.tool(
    "insert_node",
    `Insert a single node at a specific position. IMPORTANT:
    1. ALWAYS call getEditorContentForModel before using this tool to get the current editor state
    2. Remember that each insertion can change the document structure and affect subsequent positions
    3. For images, use the image reference format with a valid fileId (starts with 'fil_')

    Best used when:
    - You need to add new content between existing nodes
    - You want to expand the document with multiple paragraphs
    - You want to insert an image with its file ID

    DO NOT assume positions remain the same after previous insertions
    DO NOT use this tool without first getting the current editor content
    DO NOT use invalid file IDs for images`,
    { params: InsertNodeSchema },
    async ({ params }) => {
      editor
        .chain()
        .focus()
        .command(({ commands, tr }) => {
          const positions = getDocumentPositions(tr.doc);
          const targetPosition = positions[params.position];
          const insertPos = targetPosition
            ? targetPosition.pos
            : tr.doc.content.size;

          const n = contentToHtml(params.node);
          commands.insertContentAt(insertPos, n);

          return true;
        })
        .run();

      return {
        content: [
          {
            type: "text",
            text: `Successfully inserted node at position ${params.position}`,
          },
        ],
      };
    }
  );
}
