import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Simple content schema for initial content.
const InitialNodeSchema = z.object({
  type: z.enum(["text"]),
  content: z.string(),
});

export type InitialNode = z.infer<typeof InitialNodeSchema>;

const ToggleCoEditionSchema = z.object({
  enabled: z
    .boolean()
    .describe(
      "Toggle co-edition mode. When enabled, provides a shared rich text editor for " +
        "real-time collaborative document editing. This tool should ALWAYS be used when: " +
        "1) The user wants to write, edit, or collaborate on any document " +
        "2) The user mentions creating content together " +
        "3) The user asks about writing something " +
        "4) The user wants to work on text collaboratively " +
        "5) The user needs to draft, revise, or finalize any written content " +
        "Enable this tool proactively for any writing or collaboration task, even if not explicitly requested. " +
        "IMPORTANT: Once co-edition is enabled, additional tools become available: " +
        "- You can insert content into the editor for the user to review " +
        "- You can retrieve content wri tten by the user " +
        "- You can format text, add headings, lists, and other elements " +
        "- You can collaborate in real-time with the user on the same document " +
        "Always enable co-edition first before attempting to use any of these collaboration features."
    ),
  initialNodes: z
    .array(InitialNodeSchema)
    .optional()
    .describe(
      "Optional initial content to add to the editor when enabling co-edition. " +
        "Provide an array of text nodes that will form the initial document. " +
        "Each node will be rendered as a separate block in the editor. " +
        "IMPORTANT: Only raw text or HTML content is expected in the 'content' field. " +
        "Markdown formatting is NOT supported and will be displayed as plain text. " +
        "\nExample:" +
        "\n[" +
        "\n  { type: 'text', content: '<h1>Welcome to the document!</h1>' }," +
        "\n  { type: 'text', content: 'Let's start collaborating.' }" +
        "\n]"
    ),
});

export function registerToggleTool(
  server: McpServer,
  onToggle: (enabled: boolean, initialNodes?: InitialNode[]) => Promise<void>
): void {
  server.tool(
    "toggle_co_edition",
    "Enable or disable co-edition mode and optionally add initial content",
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
