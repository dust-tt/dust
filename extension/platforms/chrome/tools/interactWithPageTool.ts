import { sendInteractWithPageMessage } from "@extension/platforms/chrome/messages";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

const inputSchema = z.object({
  action: z
    .enum(["get_elements", "click_element", "type_text", "delete_text"])
    .describe("Action to perform."),
  tab_id: z.number().describe("The ID of the tab to interact with."),
  element_id: z
    .string()
    .nullable()
    .describe(
      "ID of the element to interact with. Required for click_element, type_text and delete_text. Must match an element returned by get_elements."
    ),

  text: z.string().nullable().describe("Text to insert when using type_text."),

  textActionVariant: z
    .enum(["replace", "append"])
    .nullable()
    .describe(
      "How text should be applied when using type_text: replace existing content or append to it."
    ),
});

export function registerInteractWithPageTool(server: McpServer): void {
  server.tool(
    "chrome-interact-with-page",
    `Interact with the webpage the user is currently viewing.

Available actions:
- get_elements: retrieve the interactive and text elements on the page.
- click_element: trigger an element's click behavior (e.g., buttons, links, toggles, menu items).
- type_text: insert text into an editable element.
- delete_text: deletes the text of an editable element.

Important rules:
- Use get_elements when you need to see what elements are available.
- Use click_element for controls like buttons or links.
- Use type_text for entering text into inputs. Or removing text with the replace option.

type_text automatically focuses the element before typing.
delete_text automatically focuses the element before deleting the text.
For the above reasons in most cases you do NOT need to click an element before calling type_text or delete_text.
Avoid unnecessary actions.`,
    inputSchema.shape,
    async (input) => {
      if (input.action === "type_text") {
        const elementId = input.element_id;
        if (!elementId) {
          return {
            content: [{ type: "text", text: "No elementId specified" }],
            isError: true,
          };
        }
        const variant = input.textActionVariant;
        if (!variant) {
          return {
            content: [{ type: "text", text: "No textActionVariant specified" }],
            isError: true,
          };
        }

        const typeResponse = await sendInteractWithPageMessage({
          action: "type_text",
          tabId: input.tab_id,
          elementId,
          text: input.text ?? "",
          variant,
        });
        if (!typeResponse.success) {
          return {
            content: [
              {
                type: "text",
                text: `${typeResponse.error ?? "Unexpected error when typing in element"} ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Text inserted successfully. ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
            },
          ],
        };
      }

      if (input.action === "delete_text") {
        const elementId = input.element_id;
        if (!elementId) {
          return {
            content: [{ type: "text", text: "No elementId specified" }],
            isError: true,
          };
        }

        const typeResponse = await sendInteractWithPageMessage({
          action: "delete_text",
          tabId: input.tab_id,
          elementId,
        });
        if (!typeResponse.success) {
          return {
            content: [
              {
                type: "text",
                text: `${typeResponse.error ?? "Unexpected error when deleting text in element"} ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Text deleted successfully. ${typeResponse.elementsDiff ? `Elements diff: ${typeResponse.elementsDiff}` : ""}`,
            },
          ],
        };
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
                text: `${clickResponse.error ?? "Unexpected error when clicking element"} ${clickResponse.elementsDiff ? `Elements diff: ${clickResponse.elementsDiff}` : ""}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Button clicked successfully. ${clickResponse.elementsDiff ? `Elements diff: ${clickResponse.elementsDiff}` : ""}`,
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
