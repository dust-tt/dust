import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CoEditionContent } from "@app/components/assistant/conversation/co_edition/tools/editor/types";
import { CoEditionContentSchema } from "@app/components/assistant/conversation/co_edition/tools/editor/types";

const ToggleCoEditionSchema = z.object({
  enabled: z
    .boolean()
    .describe(
      "Set to true to enable co-edition mode, false to disable it. " +
        "When enabled, a shared editor becomes available for collaborative editing. " +
        "When disabled, the editor is closed and collaboration ends."
    ),
  initialNodes: z
    .array(CoEditionContentSchema)
    .optional()
    .describe(
      "Optional initial content to add to the editor when enabling co-edition. " +
        "Provide an array of nodes that will form the initial document. " +
        "Each node will be rendered as a separate block in the editor. " +
        "Supported node types:\n" +
        "1. Text nodes: { type: 'text', content: '<h1>Title</h1>' }\n" +
        "2. Image nodes: { type: 'image', fileId: 'fil_123', alt: 'Optional alt text' }\n" +
        "IMPORTANT: Only raw text or HTML content is expected in text nodes. " +
        "Markdown formatting is NOT supported and will be displayed as plain text. " +
        "For images, provide a valid fileId that starts with 'fil_'."
    ),
});

export function registerToggleTool(
  server: McpServer,
  onToggle: (
    enabled: boolean,
    initialNodes?: CoEditionContent[]
  ) => Promise<void>
): void {
  server.tool(
    "toggle_co_edition",
    "Enable or disable the co-edition mode, which provides a shared rich text editor " +
      "for real-time collaborative document editing. When enabled, this creates a " +
      "collaborative workspace where both the agent and user can edit the same " +
      "document. The tool supports setting an initial content to start " +
      "the collaboration.\n\n" +
      "This tool should ONLY be used when:\n" +
      "1) The user has shown clear intent for collaborative writing over multiple messages\n" +
      "2) The user explicitly requests to work together on a document\n" +
      "3) The conversation naturally evolves into a collaborative writing session\n\n" +
      "DO NOT use this tool for:\n" +
      "1) Single message responses or quick edits\n" +
      "2) Simple text formatting or minor corrections\n" +
      "3) When the user hasn't shown interest in collaborative writing\n" +
      "4) As a default response to any writing-related request\n\n" +
      "The tool should be used sparingly and only when there's clear evidence of an ongoing " +
      "collaborative writing session or explicit request for co-editing.",
    { params: ToggleCoEditionSchema },
    async ({ params }) => {
      await onToggle(params.enabled, params.initialNodes);

      return {
        content: [
          {
            type: "text",
            text: `Co-edition ${params.enabled ? "enabled" : "disabled"}${
              params.enabled && params.initialNodes
                ? " with initial content"
                : ""
            }`,
          },
        ],
      };
    }
  );
}
