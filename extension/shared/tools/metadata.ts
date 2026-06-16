import { createClientToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { z } from "zod";

export const ATTACH_TABS_TEXT_TOOL_NAME = "attach_tabs_text";
export const TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME =
  "take_screenshot_or_attach_file";
export const LIST_BROWSER_TABS_TOOL_NAME = "list_browser_tabs";
export const SWITCH_TO_BROWSER_TAB_TOOL_NAME = "switch_to_browser_tab";
export const CLOSE_BROWSER_TAB_TOOL_NAME = "close_browser_tab";
export const OPEN_BROWSER_TAB_TOOL_NAME = "open_browser_tab";
export const MOVE_BROWSER_TAB_TOOL_NAME = "move_browser_tab";
export const RELOAD_BROWSER_TAB_TOOL_NAME = "reload_browser_tab";
export const INTERACT_WITH_PAGE_TOOL_NAME = "interact_with_page";

export function getBrowserMCPServerInstructions({
  platformName,
  serverName,
}: {
  platformName: string;
  serverName: string;
}) {
  return (
    `You are running inside a Dust ${platformName} extension. ` +
    "The user is actively browsing the web, so their questions often relate to content on their current browser tab. " +
    "When the user's message implicitly or explicitly refers to a page, article, document, email, thread, or 'this' / 'it' / 'the page' without further specification, retrieve the relevant context with the least intrusive tool that can answer accurately. " +
    `Use \`${getPrefixedToolName(
      serverName,
      ATTACH_TABS_TEXT_TOOL_NAME
    )}\` when the user asks about the specific content currently visible in the browser, including ordinary HTML pages, rendered emails or threads, search results, filtered lists, and transient UI state. ` +
    "Use dedicated MCP tools when the task needs structured access, search, creation, editing, or other canonical actions in a supported service. Do not treat a service domain as a hard rule: visible browser content may still be the best signal. " +
    `Use \`${getPrefixedToolName(
      serverName,
      INTERACT_WITH_PAGE_TOOL_NAME
    )}\` only when the task requires manipulating the visible UI. ` +
    `Use \`${getPrefixedToolName(
      serverName,
      TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME
    )}\` only when visual or file content is necessary, such as PDFs, images, layout, charts, visible errors, canvas content, or when page text or dedicated tools are insufficient. ` +
    "Do not ask the user to paste the content themselves — retrieve it directly with the available tools."
  );
}

export const CHROME_TOOLS_METADATA = createClientToolsRecord({
  [ATTACH_TABS_TEXT_TOOL_NAME]: {
    description:
      "Extracts the title, URL, and text content of a browser tab. " +
      "Use this to read and understand the specific content the user is viewing, including ordinary HTML pages, rendered emails or threads, search results, filtered lists, and other visible browser state. " +
      "For structured access or canonical actions in supported services, prefer dedicated MCP tools when available. " +
      `For visual or file content that text extraction cannot capture (PDFs, images, charts, layout, visible errors, canvas content), use ${TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME} instead. ` +
      `Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs. Group by domains to fetch the content of all tabs from the same domain.`,
    schema: {
      tabsToFetch: z
        .string()
        .describe("The list of tabs title, readable for the user."),
      domainToFetch: z
        .string()
        .describe("The domain of the tab(s) that will be fetched."),
      tabIds: z.number().array().describe("The tab IDs to read."),
    },
    argumentsRequiringApproval: ["domainToFetch"],
    stake: "medium",
    displayLabels: {
      running: "Getting page content...",
      done: "Page content retrieved",
    },
  },
  [TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME]: {
    description:
      "Captures or attaches visual or file content from a browser tab. " +
      "For PDF pages, uploads the file and returns the full extracted text so you can read it. " +
      "For image pages, returns the image directly so you can visually analyze it. " +
      "For HTML pages, use this only when visual inspection is required or text extraction and dedicated MCP tools are insufficient, for example charts, layout-specific questions, visible errors, dashboards, or unsupported canvas-like surfaces. " +
      "Do not use this as the default way to read ordinary page content. " +
      `Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs. Group by domains to fetch the content of all tabs from the same domain.`,
    schema: {
      tabsToFetch: z
        .string()
        .describe("The list of tabs title, readable for the user."),
      domainToFetch: z
        .string()
        .describe("The domain of the tab(s) that will be fetched."),
      tabIds: z.number().array().describe("The tab IDs to capture."),
    },
    argumentsRequiringApproval: ["domainToFetch"],
    stake: "medium",
    displayLabels: {
      running: "Attaching tab content...",
      done: "Tab content attached",
    },
  },
  [LIST_BROWSER_TABS_TOOL_NAME]: {
    description:
      "Lists all open tabs in the current browser window with their tab ID, title, URL, and whether they are active. " +
      "The active tab (what the user is currently looking at) is marked with an asterisk (*). " +
      "Use this to discover which tabs the user has open and to identify the currently active tab. " +
      `Tab IDs can be passed to ${ATTACH_TABS_TEXT_TOOL_NAME} or ${TAKE_SCREENSHOT_OR_ATTACH_FILE_TOOL_NAME} to read a specific tab.`,
    schema: {},
    stake: "low",
    displayLabels: {
      running: "Listing browser tabs...",
      done: "Browser tabs listed",
    },
  },
  [SWITCH_TO_BROWSER_TAB_TOOL_NAME]: {
    description:
      "Switches to the specified browser tab, making it the active tab. " +
      `Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs.`,
    schema: {
      tabId: z.number().describe("The tab ID to activate."),
    },
    stake: "low",
    displayLabels: {
      running: "Activating browser tab...",
      done: "Browser tab activated",
    },
  },
  [CLOSE_BROWSER_TAB_TOOL_NAME]: {
    description: `Closes the specified browser tab. Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs.`,
    schema: {
      tabId: z.number().describe("The tab ID to close."),
    },
    stake: "low",
    displayLabels: {
      running: "Closing browser tab...",
      done: "Browser tab closed",
    },
  },
  [OPEN_BROWSER_TAB_TOOL_NAME]: {
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
  [MOVE_BROWSER_TAB_TOOL_NAME]: {
    description:
      "Moves a browser tab to a new position (index) in the tab bar. " +
      `Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs and current order.`,
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
  [RELOAD_BROWSER_TAB_TOOL_NAME]: {
    description:
      "Reloads the specified browser tab. Useful after server-side actions that modify page content. " +
      `Use ${LIST_BROWSER_TABS_TOOL_NAME} to discover tab IDs.`,
    schema: {
      tabId: z.number().describe("The tab ID to reload."),
    },
    stake: "low",
    displayLabels: {
      running: "Reloading browser tab...",
      done: "Browser tab reloaded",
    },
  },
  [INTERACT_WITH_PAGE_TOOL_NAME]: {
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
- Before interacting with pages from services that commonly have dedicated MCP tools, such as Notion, Gmail, Google Docs, or Google Calendar, check for a dedicated tool via toolsets__list when available.
- Prefer dedicated MCP tools for structured access, search, creation, editing, or other canonical actions in supported services.
- Use this tool when the task requires manipulating the visible UI, when the dedicated tool cannot access the relevant browser state, or when no suitable dedicated tool is available.

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
      humanReadableDescription: z
        .string()
        .describe(
          "A human-readable description of the interaction being performed. Describe the tab, the element, and the action clearly, e.g. 'Click the Submit button on the Login tab' or 'Type \"hello\" into the search input on the Google tab'."
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
