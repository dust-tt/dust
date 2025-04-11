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
      "Set to true to enable co-edition mode, false to disable it. " +
        "When enabled, a shared editor becomes available for collaborative editing. " +
        "When disabled, the editor is closed and collaboration ends."
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
        "\n  { type: 'text', content: '<h1>Project Proposal: AI Integration</h1>' }," +
        "\n  { type: 'text', content: 'Let's start collaborating on this proposal.' }" +
        "\n]"
    ),
});

export function registerToggleTool(
  server: McpServer,
  onToggle: (enabled: boolean, initialNodes?: InitialNode[]) => Promise<void>
): void {
  server.tool(
    "toggle_co_edition",
    "Enable or disable the co-edition mode, which provides a shared rich text editor " +
      "for real-time collaborative document editing. When enabled, this creates a " +
      "collaborative workspace where both the agent and user can edit the same " +
      "document. The tool supports setting an initial content to start " +
      "the collaboration.\n\n" +
      "This tool should be used when:\n" +
      "1) The user wants to write, edit, or collaborate on any document\n" +
      "2) The user mentions creating content together\n" +
      "3) The user asks about writing something\n" +
      "4) The user wants to work on text collaboratively\n" +
      "5) The user needs to draft, revise, or finalize any written content\n\n" +
      "Enable this tool proactively for any writing or collaboration task, even if not explicitly requested.",
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
