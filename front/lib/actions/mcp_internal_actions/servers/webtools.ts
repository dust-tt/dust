import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  BrowseResultResourceType,
  WebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { actionRefsOffset } from "@app/lib/actions/utils";
import { getWebsearchNumResults } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { tokenCountForTexts } from "@app/lib/tokenization";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";

export const serverInfo: InternalMCPServerDefinitionType = {
  name: DEFAULT_WEBSEARCH_ACTION_NAME,
  version: "1.0.0",
  description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  icon: "ActionGlobeAltIcon",
  authorization: null,
  documentationUrl: null,
};

const BROWSE_MAX_TOKENS_LIMIT = 32_000;

const createServer = (agentLoopContext?: AgentLoopContextType): McpServer => {
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

      const numResults = getWebsearchNumResults({
        stepActions: agentLoopRunContext.stepActions,
      });

      const websearchRes = await webSearch({
        provider: "serpapi",
        query,
        page,
        num: numResults,
      });

      if (websearchRes.isErr()) {
        return makeMCPToolTextError(
          `Failed to search: ${websearchRes.error.message}`
        );
      }

      const refsOffset = actionRefsOffset({
        agentConfiguration: agentLoopRunContext.agentConfiguration,
        stepActionIndex: agentLoopRunContext.stepActionIndex,
        stepActions: agentLoopRunContext.stepActions,
        refsOffset: agentLoopRunContext.citationsRefsOffset,
      });
      const refs = getRefs().slice(refsOffset, refsOffset + numResults);

      const results: WebsearchResultResourceType[] = [];
      for (const result of websearchRes.value) {
        results.push({
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
          title: result.title,
          text: result.snippet,
          uri: result.link,
          reference: refs.shift() as string,
        });
      }

      return {
        isError: false,
        content: [
          ...results.map((result) => ({
            type: "resource" as const,
            resource: result,
          })),
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
    "webbrowser",
    "A tool to browse websites, you can provide a list of urls to browse all at once.",
    {
      urls: z.string().array().describe("List of urls to browse"),
    },
    async ({ urls }) => {
      const results = await browseUrls(urls);

      const content: BrowseResultResourceType[] = [];
      for (const result of results) {
        if (!isBrowseScrapeSuccessResponse(result)) {
          content.push({
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
            requestedUrl: result.url,
            uri: result.url,
            text: "There was an error while browsing the website.",
            responseCode: result.status.toString(),
            errorMessage: result.error,
          });
          continue;
        }

        const { markdown, title, description } = result;

        const tokensRes = await tokenCountForTexts([markdown], {
          providerId: "openai",
          modelId: "gpt-4o",
        });

        if (tokensRes.isErr()) {
          content.push({
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
            requestedUrl: result.url,
            uri: result.url,
            text: "There was an error while browsing the website.",
            title: title,
            description: description,
            responseCode: result.status.toString(),
            errorMessage: tokensRes.error.message,
          });
          continue;
        }

        const tokensCount = tokensRes.value[0];
        const avgCharactersPerToken = (markdown?.length ?? 0) / tokensCount;
        const maxCharacters = BROWSE_MAX_TOKENS_LIMIT * avgCharactersPerToken;
        let truncatedMarkdown = markdown?.slice(0, maxCharacters);

        if (truncatedMarkdown?.length !== markdown?.length) {
          truncatedMarkdown += `\n\n[...output truncated to ${BROWSE_MAX_TOKENS_LIMIT} tokens]`;
        }

        content.push({
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
          requestedUrl: result.url,
          uri: result.url,
          text:
            truncatedMarkdown ??
            "There was an error while browsing the website.",
          title: title,
          description: description,
          responseCode: result.status.toString(),
        });
      }

      return {
        isError: false,
        content: content.map((result) => ({
          type: "resource" as const,
          resource: result,
        })),
      };
    }
  );

  return server;
};

export default createServer;
