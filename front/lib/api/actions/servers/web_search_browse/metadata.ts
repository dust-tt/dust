import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const MAX_BROWSE_URLS = 16;
export const WEB_SEARCH_BROWSE_SERVER_NAME = "web_search_&_browse" as const;
export const WEB_SEARCH_BROWSE_ACTION_DESCRIPTION =
  "Agent can search (Google) and retrieve information from specific websites.";

export const WEB_SEARCH_BROWSE_TOOLS_METADATA = createToolsRecord({
  websearch: {
    description:
      "A tool that performs a Google web search based on a string query.",
    schema: {
      query: z
        .string()
        .describe(
          "The query used to perform the Google search. If requested by the " +
            "user, use the Google syntax `site:` to restrict the search " +
            "to a particular website or domain."
        ),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Searching the web",
      done: "Web search",
    },
  },
  webbrowser: {
    description:
      `A tool to browse websites, you can provide a list of up to ${MAX_BROWSE_URLS} urls to browse all at once.`,
    schema: {
      urls: z
        .string()
        .array()
        .max(MAX_BROWSE_URLS)
        .describe(`List of urls to browse (max: ${MAX_BROWSE_URLS})`),
      format: z
        .enum(["markdown", "html"])
        .optional()
        .describe("Format to return content: 'markdown' (default) or 'html'."),
      screenshotMode: z
        .enum(["none", "viewport", "fullPage"])
        .optional()
        .describe(
          "Screenshot mode: 'none' (default), 'viewport', or 'fullPage'."
        ),
      links: z
        .boolean()
        .optional()
        .describe("If true, also retrieve outgoing links from the page."),
    },
    stake: "never_ask",
    enableAlerting: true,
    displayLabels: {
      running: "Browsing web page",
      done: "Browse web page",
    },
  },
});

export const WEB_SEARCH_BROWSE_SERVER = {
  serverInfo: {
    name: WEB_SEARCH_BROWSE_SERVER_NAME,
    version: "1.0.0",
    description: WEB_SEARCH_BROWSE_ACTION_DESCRIPTION,
    authorization: null,
    icon: "ActionGlobeAltIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(WEB_SEARCH_BROWSE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(WEB_SEARCH_BROWSE_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
