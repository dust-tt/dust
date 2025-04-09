import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Schema for the email draft tool arguments.
export const FrontCreateDraftToolArgsSchema = z.object({
  to: z.array(z.string()).describe("The email addresses of the recipients."),
  subject: z
    .string()
    .describe(
      "The subject line of the email. If not provided, the subject line of the original " +
        "message will be used."
    )
    .optional(),
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
 * Registers the email draft tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param frontContext The Front context for sending comments
 */
export function registerEmailDraftTool(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  server.tool(
    "front-create-email-reply-draft",
    "Creates a draft email reply in the current Front conversation. The message will\n" +
      "be saved as a draft, ready for human review. Supports specifying recipients,\n" +
      "subject line, and message content in either text or HTML format.",
    {
      draft: FrontCreateDraftToolArgsSchema,
    },
    async ({ draft }) => {
      if (frontContext?.type !== "singleConversation") {
        return {
          content: [
            {
              type: "text",
              text: "Not in a single conversation",
            },
          ],
        };
      }

      try {
        const messages = await frontContext.listMessages();
        const lastMessage = messages.results[messages.results.length - 1];

        const d = await frontContext.createDraft({
          ...draft,
          replyOptions: {
            type: "reply",
            originalMessageId: lastMessage.id,
          },
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
        console.error("Error creating draft in Front:", error);
        return {
          content: [{ type: "text", text: `Error creating draft: ${error}` }],
        };
      }
    }
  );
}
