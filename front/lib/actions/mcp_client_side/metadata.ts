import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const CHROME_TOOLS_METADATA = createToolsRecord({
  get_current_browser_page: {
    description:
      "Extracts the title, URL, and text content of a browser tab. " +
      "Use this to read and understand what the user is viewing. " +
      "For non-text pages (PDFs, images, etc.), use get_current_browser_page_view instead — it will attach the file directly to the conversation." +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabId: z
        .number()
        .optional()
        .describe(
          "The tab ID to read. If omitted, reads the active tab. Use list_browser_tabs to get tab IDs."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Getting current page content...",
      done: "Page content retrieved",
    },
  },
  get_current_browser_page_view: {
    description:
      "Captures or attaches the content of a browser tab. " +
      "For PDF pages, uploads the file and returns the full extracted text so you can read it. " +
      "For image pages, returns the image directly so you can visually analyze it. " +
      "For HTML pages, takes a screenshot for visual inspection (Drive canvas, dashboards, etc.)." +
      "Use list_browser_tabs to discover tab IDs.",
    schema: {
      tabId: z
        .number()
        .optional()
        .describe(
          "The tab ID to capture. If omitted, captures the active tab. Use list_browser_tabs to get tab IDs."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Capturing screenshot of current page...",
      done: "Screenshot captured",
    },
  },
  list_browser_tabs: {
    description:
      "Lists all open tabs in the current browser window with their tab ID, title, URL, and whether they are active. " +
      "Use this to discover which tabs the user has open. " +
      "Tab IDs can be passed to get_current_browser_page or get_current_browser_page_view to read a specific tab.",
    schema: {},
    stake: "low",
    displayLabels: {
      running: "Listing browser tabs...",
      done: "Browser tabs listed",
    },
  },
  activate_browser_tab: {
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
      "Use list-browser-tabs to discover tab IDs.",
    schema: {
      tabId: z.number().describe("The tab ID to reload."),
    },
    stake: "low",
    displayLabels: {
      running: "Reloading browser tab...",
      done: "Browser tab reloaded",
    },
  },
});
