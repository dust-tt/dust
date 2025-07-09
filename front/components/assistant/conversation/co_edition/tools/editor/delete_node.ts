import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

const DeleteNodeSchema = z.object({
  nodeId: z
    .string()
    .describe(
      "The ID of the node to delete (found in getEditorContentForModel response)"
    ),
});

export function registerDeleteNodeTool(server: McpServer, editor: Editor) {
  server.tool(
    "delete_node",
    `Delete a node. IMPORTANT: Use this tool only after analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to remove a node
    - You want to simplify the document`,
    { params: DeleteNodeSchema },
    async ({ params }) => {
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const doc = tr.doc;
          let found = false;

          // Track position as we traverse.
          doc.descendants((node, pos) => {
            if (node.attrs["data-id"] === params.nodeId) {
              // Delete the node at its position using the transaction.
              tr.delete(pos, pos + node.nodeSize);
              found = true;

              return false; // Stop traversing.
            }
          });

          return found;
        })
        .run();

      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted node ${params.nodeId}`,
          },
        ],
      };
    }
  );
}
