import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Schema for the new conversation draft tool arguments.
export const NewConversationDraftToolArgsSchema = z.object({
  to: z.array(z.string()).describe("The email addresses of the recipients."),
  subject: z.string().describe("The subject line of the new email.").optional(),
  content: z
    .object({
      type: z.enum(["text", "html"]),
      body: z.string().describe("The body of the email."),
    })
    .describe(
      "The content of the email. Specify the type and body of the email."
    )
    .optional(),
});

/**
 * Registers the new conversation draft tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param frontContext The Front context for sending comments
 */
export function registerNewConversationDraftTool(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  server.tool(
    "front-create-new-conversation-draft",
    "Creates a new conversation draft in Front. This is different from a reply draft as it\n" +
      "creates a completely new conversation rather than replying to an existing one.\n" +
      "The message will be saved as a draft, ready for human review.",
    {
      draft: NewConversationDraftToolArgsSchema,
    },
    async ({ draft }) => {
      if (!frontContext) {
        return {
          content: [
            {
              type: "text",
              text: "Front context not available",
            },
          ],
        };
      }

      try {
        const d = await frontContext.createDraft({
          ...draft,
          // No replyOptions needed for a new conversation
        });

        return {
          content: [
            {
              type: "text",
              text: "Draft created successfully. Draft ID: " + d.id,
            },
          ],
        };
      } catch (error) {
        console.error("Error creating new conversation draft in Front:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating new conversation draft: ${error}`,
            },
          ],
        };
      }
    }
  );
}
