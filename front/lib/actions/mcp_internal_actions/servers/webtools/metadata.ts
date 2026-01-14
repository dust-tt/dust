import type { JSONSchema7 as JSONSchema } from "json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  WebbrowseInputSchema,
  WebsearchInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const WEBSEARCH_TOOL_NAME = "websearch";
export const WEBBROWSER_TOOL_NAME = "webbrowser";

export { WebbrowseInputSchema, WebsearchInputSchema };

export const WEBTOOLS_TOOLS: MCPToolType[] = [
  {
    name: WEBSEARCH_TOOL_NAME,
    description:
      "A tool that performs a Google web search based on a string query.",
    inputSchema: zodToJsonSchema(WebsearchInputSchema) as JSONSchema,
  },
  {
    name: WEBBROWSER_TOOL_NAME,
    description:
      "A tool to browse websites, you can provide a list of urls to browse all at once.",
    inputSchema: zodToJsonSchema(WebbrowseInputSchema) as JSONSchema,
  },
];

export const WEBTOOLS_SERVER_INFO = {
  name: "web_search_&_browse" as const,
  version: "1.0.0",
  description:
    "Agent can search (Google) and retrieve information from specific websites.",
  authorization: null,
  icon: "ActionGlobeAltIcon" as const,
  documentationUrl: null,
  instructions: null,
};
