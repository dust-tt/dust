import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

const ReplaceTextRangeSchema = z.object({
  nodeId: z
    .string()
    .describe("The ID of the node containing the range to replace"),
  startOffset: z
    .number()
    .describe("The starting character offset within the node"),
  endOffset: z.number().describe("The ending character offset within the node"),
  content: z
    .string()
    .describe(
      "The new content to insert. Supports plain text or HTML (e.g. '<p>Some " +
        "<strong>bold</strong> text</p>'). Markdown is not supported."
    ),
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
      editor
        .chain()
        .focus()
        .command(({ chain, tr }) => {
          // Find the node and replace the range.
          const doc = tr.doc;
          let found = false;
          doc.descendants((node) => {
            if (node.attrs["data-id"] === params.nodeId) {
              chain()
                // First delete the content range. This position the cursor at the end of the range.
                .deleteRange({
                  from: params.startOffset,
                  to: params.endOffset,
                })
                // Then insert the new content with agentContent mark.
                .setMark("agentContent")
                .insertContent(params.content, {
                  parseOptions: { preserveWhitespace: "full" },
                });

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
            text: `Successfully replaced text range in node ${params.nodeId}`,
          },
        ],
      };
    }
  );
}
