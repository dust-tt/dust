import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  registerWebBrowserToolWithConfig,
  registerWebSearchToolWithConfig,
} from "@app/lib/actions/mcp_internal_actions/tools/web_browser/web_browser_tools";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

import { ConfigurableToolInputSchemas } from "../input_schemas";

export const ADVANCED_WEB_TOOLS_SERVER_NAME = "advanced_web_tools";

// Configuration schemas for advanced web tools

// Enum schema for search provider selection with options for UI display
// The options property is used by the UI to display a dropdown with labeled choices
export const AdvancedWebSearchProviderSchema = z
  .object({
    options: z
      .union([
        z
          .object({
            value: z.literal("firecrawl"),
            label: z.literal("Firecrawl"),
          })
          .describe("Firecrawl web search provider"),
        // Second option required by z.union - serpapi reserved for future use
        z
          .object({
            value: z.literal("serpapi"),
            label: z.literal("SerpAPI (coming soon)"),
          })
          .describe("SerpAPI web search provider - coming soon"),
      ])
      .optional(),
    value: z.enum(["firecrawl"]),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
  })
  .describe("Provider for web search")
  .default({
    value: "firecrawl",
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
  });

export const AdvancedWebBrowseSummarizationSchema = ConfigurableToolInputSchemas[
  INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN
]
  .describe(
    "Enable AI-powered summarization for web browsing. When enabled, web pages are summarized before being returned."
  )
  .default({
    value: false,
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
  });

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(ADVANCED_WEB_TOOLS_SERVER_NAME);

  // Register web search tool with configurable provider
  registerWebSearchToolWithConfig(auth, server, agentLoopContext, {
    providerSchema: AdvancedWebSearchProviderSchema,
  });

  // Register web browser tool with configurable summarization
  registerWebBrowserToolWithConfig(auth, server, agentLoopContext, {
    summarizationSchema: AdvancedWebBrowseSummarizationSchema,
  });

  return server;
}

export default createServer;
