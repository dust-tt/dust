import type { ApplicationDraftUpdate } from "@frontapp/plugin-sdk";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Schema for the update draft tool arguments.
export const UpdateDraftToolArgsSchema = z.object({
  draftId: z.string().describe("The ID of the draft to update."),
  to: z
    .array(z.string())
    .describe("The email addresses of the recipients.")
    .optional(),
  subject: z.string().describe("The subject line of the email.").optional(),
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
 * Registers the update draft tool with the MCP server
 * @param server The MCP server to register the tool with
 * @param frontContext The Front context for sending comments
 */
export function registerUpdateDraftTool(
  server: McpServer,
  frontContext: WebViewContext | null
): void {
  server.tool(
    "front-update-draft",
    "Updates an existing draft in Front. This allows modifying the recipients,\n" +
      "subject line, or content of an existing draft. Only the fields that are\n" +
      "provided will be updated.",
    {
      update: UpdateDraftToolArgsSchema,
    },
    async ({ update }) => {
      if (!frontContext || frontContext.type !== "singleConversation") {
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
        // Create an update object with only the provided fields.
        const updateData: ApplicationDraftUpdate = {
          updateMode: "replace", // We only replace the provided fields.
        };

        if (update.to) {
          updateData.to = update.to;
        }

        if (update.subject) {
          updateData.subject = update.subject;
        }

        if (update.content) {
          updateData.content = update.content;
        }

        // Update the draft with the provided data.
        await frontContext.updateDraft(update.draftId as any, updateData);

        return {
          content: [{ type: "text", text: "Draft updated successfully" }],
        };
      } catch (error) {
        console.error("Error updating draft in Front:", error);
        return {
          content: [{ type: "text", text: `Error updating draft: ${error}` }],
        };
      }
    }
  );
}
