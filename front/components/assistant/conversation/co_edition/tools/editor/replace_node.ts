import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

import { CoEditionContentSchema } from "@app/components/assistant/conversation/co_edition/tools/editor/types";
import { contentToHtml } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

const ReplaceNodeSchema = z.object({
  nodeId: z
    .string()
    .describe(
      "The ID of the node to replace (found in getEditorContentForModel response)"
    ),
  node: CoEditionContentSchema,
});

export function registerReplaceNodeTool(server: McpServer, editor: Editor) {
  server.tool(
    "replace_node",
    `Replace the entire content of a specified node. IMPORTANT: Use this tool only after
    analyzing the current content with getEditorContentForModel.

    Best used when:
    - You need to completely rewrite a node
    - The node's content needs to be restructured entirely
    - You want to replace content with an image

    DO NOT use this tool to delete a node - use the delete_node tool instead.
    DO NOT use this tool to insert a node - use the insert_node tool instead.
    DO NOT use invalid file IDs for images.`,
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
              // Convert content to HTML.
              const content = contentToHtml(params.node);

              // Replace content using insertContentAt.
              commands.insertContentAt(
                { from: pos, to: pos + node.nodeSize },
                content
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
