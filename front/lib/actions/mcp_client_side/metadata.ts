import { createClientToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const CHROME_TOOLS_METADATA = createClientToolsRecord({
  attach_tabs_text: {
    description:
      "Extracts the title, URL, and text content of a browser tab. " +
      "Use this to read and understand what the user is viewing. " +
      "For non-text pages (PDFs, images, etc.), use take_screenshot_or_attach_file instead — it will attach the file directly to the conversation." +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabsToFetch: z
        .string()
        .describe("The list of tabs title, readable for the user."),
      tabIds: z.number().array().describe("The tab IDs to read."),
    },
    stake: "high",
    displayLabels: {
      running: "Getting page content...",
      done: "Page content retrieved",
    },
  },
  take_screenshot_or_attach_file: {
    description:
      "Captures or attaches the content of a browser tab. " +
      "For PDF pages, uploads the file and returns the full extracted text so you can read it. " +
      "For image pages, returns the image directly so you can visually analyze it. " +
      "For HTML pages, takes a screenshot for visual inspection (Drive canvas, dashboards, etc.)." +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabsToFetch: z
        .string()
        .describe("The list of tabs title, readable for the user."),
      tabIds: z.number().array().describe("The tab IDs to capture."),
    },
    stake: "high",
    displayLabels: {
      running: "Attaching tab content...",
      done: "Tab content attached",
    },
  },
  list_browser_tabs: {
    description:
      "Lists all open tabs in the current browser window with their tab ID, title, URL, and whether they are active. " +
      "The active tab (what the user is currently looking at) is marked with an asterisk (*). " +
      "Use this to discover which tabs the user has open and to identify the currently active tab. " +
      "Tab IDs can be passed to attach_page_text or take_screenshot_or_attach_file to read a specific tab.",
    schema: {},
    stake: "low",
    displayLabels: {
      running: "Listing browser tabs...",
      done: "Browser tabs listed",
    },
  },
  switch_to_browser_tab: {
    description:
      "Switches to the specified browser tab, making it the active tab. " +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabId: z.number().describe("The tab ID to activate."),
    },
    stake: "low",
    displayLabels: {
      running: "Activating browser tab...",
      done: "Browser tab activated",
    },
  },
  close_browser_tab: {
    description:
      "Closes the specified browser tab. Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabId: z.number().describe("The tab ID to close."),
    },
    stake: "low",
    displayLabels: {
      running: "Closing browser tab...",
      done: "Browser tab closed",
    },
  },
  open_browser_tab: {
    description: "Opens a new browser tab with the specified URL.",
    schema: {
      url: z.string().url().describe("The URL to open in a new tab."),
    },
    stake: "low",
    displayLabels: {
      running: "Opening new browser tab...",
      done: "Browser tab opened",
    },
  },
  move_browser_tab: {
    description:
      "Moves a browser tab to a new position (index) in the tab bar. " +
      "Use list_browser_tabs to discover tab IDs and current order.",
    schema: {
      tabId: z.number().describe("The tab ID to move."),
      index: z
        .number()
        .describe(
          "The zero-based position to move the tab to. Use -1 to move to the end."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Moving browser tab...",
      done: "Browser tab moved",
    },
  },
  reload_browser_tab: {
    description:
      "Reloads the specified browser tab. Useful after server-side actions that modify page content. " +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabId: z.number().describe("The tab ID to reload."),
    },
    stake: "low",
    displayLabels: {
      running: "Reloading browser tab...",
      done: "Browser tab reloaded",
    },
  },
  interact_with_page: {
    description: `Interact with a browser tab of the user's browser window.

Available actions:
- get_elements: retrieve the interactive and text elements on the page.
- click_element: trigger an element's click behavior (e.g., buttons, links, toggles, menu items).
- type_text: insert text into an editable element.
- delete_text: deletes the text of an editable element.

Important rules:
- Use get_elements when you need to see what elements are available.
- Use click_element for controls like buttons or links.
- Use type_text for entering text into inputs. Or removing text with the replace option.
- Do NOT use this tool on pages from services like Notion, Gmail, Google Docs, or Google Calendar without first checking for a dedicated MCP tool via toolsets__list. If one exists, use it instead.

type_text automatically focuses the element before typing.
delete_text automatically focuses the element before deleting the text.
For the above reasons in most cases you do NOT need to click an element before calling type_text or delete_text.
Avoid unnecessary actions.`,
    schema: z.object({
      action: z
        .enum(["get_elements", "click_element", "type_text", "delete_text"])
        .describe("Action to perform."),
      tabId: z.number().describe("The ID of the tab to interact with."),
      elementId: z
        .string()
        .nullish()
        .describe(
          "ID of the element to interact with. Required for click_element, type_text and delete_text. Must match an element returned by get_elements."
        ),

      text: z
        .string()
        .nullish()
        .describe("Text to insert when using type_text."),

      textActionVariant: z
        .enum(["replace", "append"])
        .nullish()
        .describe(
          "How text should be applied when using type_text: replace existing content or append to it."
        ),
    }).shape,
    argumentsRequiringApproval: ["tabId"],
    stake: "medium",
    displayLabels: {
      running: "Interacting with page...",
      done: "Page interaction completed",
    },
  },
});
