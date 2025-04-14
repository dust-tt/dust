import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

import { CoEditionContentSchema } from "@app/components/assistant/conversation/co_edition/tools/editor/types";
import { contentToHtml } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

const ReplaceTextRangeSchema = z.object({
  nodeId: z
    .string()
    .describe("The ID of the node containing the range to replace"),
  startOffset: z
    .number()
    .describe("The starting character offset within the node"),
  endOffset: z.number().describe("The ending character offset within the node"),
  node: CoEditionContentSchema,
});

export function registerReplaceTextRangeTool(
  server: McpServer,
  editor: Editor
) {
  server.tool(
    "replace_text_range",
    `Replace specific text within a node using character offsets. IMPORTANT: Use this tool
    only after analyzing the current content with getEditorContentForModel.

    CRITICAL: Only use the exact offset values provided by getEditorContentForModel. DO NOT
    attempt to infer or calculate positions yourself.

    Best used when:
    - You need to make precise edits within a node
    - You want to modify only a portion of the text while preserving the rest
    - You have the exact character offsets from getEditorContentForModel`,
    { params: ReplaceTextRangeSchema },
    async ({ params }) => {
      let isRangeValid = false;
      const availableRanges: { from: number; to: number }[] = [];

      editor.state.doc.descendants((node, nodePos) => {
        // Check if this node has the matching data-id.
        if (node.attrs["data-id"] === params.nodeId) {
          // If the node is matching, traverse the descendants to find the range.
          node.descendants((childNode, relativePos) => {
            availableRanges.push({
              from: relativePos,
              to: relativePos + childNode.nodeSize,
            });

            if (
              relativePos === params.startOffset &&
              relativePos + childNode.nodeSize === params.endOffset
            ) {
              isRangeValid = true;

              // Convert relative positions to absolute document positions.
              const absoluteFrom = nodePos + 1 + relativePos;
              const absoluteTo = nodePos + 1 + relativePos + childNode.nodeSize;

              // Replace using absolute positions.
              const content = contentToHtml(params.node);
              editor.commands.insertContentAt(
                { from: absoluteFrom, to: absoluteTo },
                content
              );

              return false; // Stop traversal once found.
            }

            return true; // Continue traversal.
          });

          return false; // Stop traversal once found.
        }
        return true; // Continue traversal.
      });

      return {
        content: [
          {
            type: "text",
            text: isRangeValid
              ? `Successfully replaced text range in node ${params.nodeId}`
              : `Failed to find text range in node ${params.nodeId}. ` +
                `Available ranges: ${JSON.stringify(availableRanges)}`,
          },
        ],
      };
    }
  );
}
