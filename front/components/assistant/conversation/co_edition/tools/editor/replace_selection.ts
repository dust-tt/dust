import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Editor } from "@tiptap/react";
import { z } from "zod";

import { CoEditionContentSchema } from "@app/components/assistant/conversation/co_edition/tools/editor/types";
import { contentToHtml } from "@app/components/assistant/conversation/co_edition/tools/editor/utils";

const ReplaceSelectionSchema = z.object({
  from: z.number().describe("The starting position in the document"),
  to: z.number().describe("The ending position in the document"),
  content: CoEditionContentSchema,
});

export function registerReplaceSelectionTool(
  server: McpServer,
  editor: Editor
) {
  server.tool(
    "replace_selection",
    `Replace a selection in the document using absolute positions. This tool is designed for
    cases where:
    - The selection spans multiple nodes in the document
    - You have received a user's selection range (from/to positions)
    - You need to make a single atomic replacement operation across node boundaries

    This tool is simpler than replace_text_range as it works directly with document
    positions rather than node-specific offsets. It's particularly useful when working with
    user selections or when the exact document positions are known.`,
    { params: ReplaceSelectionSchema },
    async ({ params }) => {
      try {
        const content = contentToHtml(params.content);
        editor.commands.insertContentAt(
          { from: params.from, to: params.to },
          content
        );

        return {
          content: [
            {
              type: "text",
              text: `Successfully replaced selection from position ${params.from} to ${params.to}`,
            },
          ],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to replace selection: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
