import { sendInteractWithPageMessage } from "@extension/platforms/chrome/messages";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

const inputSchema = z.object({
  action: z.enum(["get_elements", "click_element", "type_text"]),
  tab_id: z.number().describe("The ID of the tab to interact with."),
  element_id: z.string().nullable(),
  text: z.string().nullable(),
});

export function registerInteractWithPageTool(server: McpServer): void {
  server.tool(
    "chrome-interact-with-page",
    "Interact with the page the user is currently viewing. Use the get_elements action to get the elements of the page. Use the click_element action to click on an element. Use the type_text action to type text into an element.",
    inputSchema.shape,
    async (input) => {
      if (input.action === "type_text") {
        throw new Error("Not implemented");
      }

      if (input.action === "click_element") {
        const elementId = input.element_id;
        if (!elementId) {
          return {
            content: [{ type: "text", text: "No elementId specified" }],
            isError: true,
          };
        }
        const clickResponse = await sendInteractWithPageMessage({
          action: "click_element",
          tabId: input.tab_id,
          elementId,
        });

        if (!clickResponse.success) {
          return {
            content: [
              {
                type: "text",
                text:
                  clickResponse.error ??
                  "Unexpected error when clicking element",
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: "Button clicked successfully",
            },
          ],
        };
      }

      const response = await sendInteractWithPageMessage({
        action: "get_elements",
        tabId: input.tab_id,
      });

      if (!response) {
        return {
          content: [
            {
              type: "text",
              text: "No response received from background script.",
            },
          ],
        };
      }

      if (response.error) {
        return {
          content: [{ type: "text", text: `Error: ${response.error}` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: response.elements,
          },
        ],
      };
    }
  );
}
