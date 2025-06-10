import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { BrowseResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { cacheWithRedis } from "@app/lib/utils/cache";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import logger from "@app/logger/logger";
import type { OAuthProvider } from "@app/types";

const DEFAULT_LIMIT = 1000;
const MIN_LIMIT = 10;
const MAX_LIMIT = 2000;
const CACHE_TTL_SECONDS = 600; // 10 minutes

export const provider: OAuthProvider = "google_drive" as const;
export const serverInfo: InternalMCPServerDefinitionType = {
  name: "web_search_&_browse_paginated",
  version: "1.0.0",
  description:
    "Agent can search (Google) and retrieve information from specific websites with pagination support.",
  icon: "ActionGlobeAltIcon",
  authorization: null,
};

interface CachedContent {
  markdown: string;
  title?: string;
  description?: string;
  url: string;
  status: number;
}

// Create a cached function for fetching content
const cachedFetchContent = cacheWithRedis(
  async (url: string): Promise<CachedContent> => {
    const results = await browseUrls([url]);
    const result = results[0];
    
    if (!result || !isBrowseScrapeSuccessResponse(result)) {
      throw new Error(result?.error || "Failed to browse URL");
    }
    
    return {
      markdown: result.markdown,
      title: result.title,
      description: result.description,
      url: result.url,
      status: result.status,
    };
  },
  (url: string) => `browse_paginated:${url}`,
  CACHE_TTL_SECONDS
);

// Function to get cached or fetch content
async function getCachedOrFetchContent(
  url: string
): Promise<CachedContent | null> {
  try {
    return await cachedFetchContent(url);
  } catch (error) {
    logger.error(
      {
        url,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to fetch or cache content"
    );
    return null;
  }
}

// Function to paginate content
function paginateContent(
  content: CachedContent,
  offset: number,
  limit: number
): BrowseResultResourceType {
  const lines = content.markdown.split('\n');
  const totalLines = lines.length;
  
  // Validate offset
  const validOffset = Math.max(0, Math.min(offset, totalLines));
  
  // Extract the requested portion
  const endIndex = validOffset + limit;
  const paginatedLines = lines.slice(validOffset, endIndex);
  const truncated = endIndex < totalLines;
  
  let paginatedMarkdown = paginatedLines.join('\n');
  
  // Add truncation indicator if needed
  if (truncated) {
    paginatedMarkdown += `\n\n---\n**[Content truncated. Total lines: ${totalLines}. Use offset: ${endIndex} to continue reading.]**`;
  }
  
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
    requestedUrl: content.url,
    uri: content.url,
    text: paginatedMarkdown,
    title: content.title,
    description: content.description,
    responseCode: content.status.toString(),
    errorMessage: undefined,
  };
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "websearch",
    "A tool that performs a Google web search based on a string query. " +
      "The input string query does not support Unicode characters.",
    {
      query: z
        .string()
        .describe(
          "The query used to perform the google search. If requested by the " +
            "user, use the google syntax `site:` to restrict the the search " +
            "to a particular website or domain. " +
            "Unicode characters are not supported."
        ),
      page: z
        .number()
        .optional()
        .describe(
          "A 1-indexed page number used to paginate through the search results." +
            " Should only be provided if page is stricly greater than 1 in order" +
            " to go deeper into the search results for a specific query."
        ),
    },
    async ({ query, page }) => {
      if (!agentLoopContext?.runContext) {
        throw new Error(
          "agentLoopRunContext is required where the tool is called."
        );
      }

      const agentLoopRunContext = agentLoopContext.runContext;

      const numResults = 10; // Default number of results

      const websearchRes = await webSearch({
        provider: "serpapi",
        query,
        page,
        num: numResults,
      });

      if (websearchRes.isErr()) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to search: ${websearchRes.error.message}`,
            },
          ],
        };
      }

      const refsOffset = actionRefsOffset({
        agentConfiguration: agentLoopRunContext.agentConfiguration,
        stepActionIndex: agentLoopRunContext.stepActionIndex,
        stepActions: agentLoopRunContext.stepActions,
        refsOffset: agentLoopRunContext.citationsRefsOffset,
      });
      const refs = getRefs().slice(refsOffset, refsOffset + numResults);

      const results = websearchRes.value.map((result) => ({
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
          title: result.title,
          text: result.snippet,
          uri: result.link,
          reference: refs.shift() as string,
        },
      }));

      return {
        isError: false,
        content: [
          ...results,
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_QUERY,
              text: query,
              uri: "",
            },
          },
        ],
      };
    }
  );

  server.tool(
    "browse",
    "A tool to browse a website with pagination support. " +
      "The content is cached for 10 minutes. If the content exceeds the limit, " +
      "it will be truncated and include information about how to fetch the next portion.",
    {
      url: z.string().describe("URL to browse"),
      limit: z
        .number()
        .min(MIN_LIMIT)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .describe(`Number of lines to return (${MIN_LIMIT}-${MAX_LIMIT})`),
      offset: z
        .number()
        .min(0)
        .default(0)
        .describe("Starting line number"),
    },
    async ({ url, limit, offset }) => {
      const content = await getCachedOrFetchContent(url);
      
      if (!content) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Failed to browse the website. Please check the URL and try again.",
            },
          ],
        };
      }
      
      const paginatedResult = paginateContent(content, offset, limit);
      
      return {
        isError: false,
        content: [
          {
            type: "resource" as const,
            resource: paginatedResult,
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;