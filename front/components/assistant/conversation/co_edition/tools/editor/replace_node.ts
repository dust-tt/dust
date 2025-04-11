import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

const ReplaceNodeSchema = z.object({
  nodeId: z
    .string()
    .describe(
      "The ID of the node to replace (found in getEditorContentForModel response)"
    ),
  content: z
    .string()
    .describe(
      "The new content for the node. Supports plain text or HTML " +
        "(e.g. '<p>Some <strong>bold</strong> text</p>'). Markdown is not supported."
    ),
});

export function registerReplaceNodeTool(server: McpServer, editor: Editor) {
  server.tool(
    "replace_node",
    `Replace the entire content of a specified node. IMPORTANT: Use this tool only after
    analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to completely rewrite a node
    - The node's content needs to be restructured entirely

    DO NOT use this tool to delete a node - use the delete_node tool instead.`,
    { params: ReplaceNodeSchema },
    async ({ params }) => {
      editor
        .chain()
        .focus()
        .command(({ tr, commands }) => {
          // Find the node.
          const doc = tr.doc;
          let found = false;

          doc.descendants((node, pos) => {
            if (node.attrs["data-id"] === params.nodeId) {
              // Replace content using insertContentAt.
              commands.insertContentAt(
                { from: pos, to: pos + node.nodeSize },
                params.content
              );
              found = true;

              return false;
            }
          });

          return found;
        })
        .run();

      return {
        content: [
          {
            type: "text",
            text: `Successfully replaced content of node ${params.nodeId}`,
          },
        ],
      };
    }
  );
}
