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
    `Replace a selection in the document using absolute positions.

    USE this tool ONLY when:
    - The user has explicitly provided a selection range (from/to positions) to work on
    - You have received a user's selection range through the UI or explicit user input
    - The selection spans multiple nodes in the document and needs atomic replacement
    - NO node IDs are provided

    DO NOT use for replacing text at arbitrary positions
    DO NOT use without explicit user selection coordinates
    DO NOT use for simpler node-specific replacements
    DO NOT use when you have or need node IDs for the operation

    For all other text replacement needs, use the replace_range tool instead.

    This tool is designed for atomic replacement of user-selected content across node boundaries.`,
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
