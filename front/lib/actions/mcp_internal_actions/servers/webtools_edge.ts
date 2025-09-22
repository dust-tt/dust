import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MAXED_OUTPUT_FILE_SNIPPET_LENGTH } from "@app/lib/actions/action_output_limits";
import {
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  ConfigurableToolInputSchemas,
  parseAgentConfigurationUri,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { WebsearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  makeInternalMCPServer,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type {
  AgentLoopContextType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getHeaderFromUserEmail, Ok } from "@app/types";

async function summarizeWithAgent({
  auth,
  agentLoopRunContext,
  summaryAgentId,
  content,
}: {
  auth: Authenticator;
  agentLoopRunContext: AgentLoopRunContextType;
  summaryAgentId: string;
  content: string;
}): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    config.getDustAPIConfig(),
    {
      ...prodCredentials,
      extraHeaders: { ...getHeaderFromUserEmail(user?.email) },
    },
    logger
  );

  const mainAgent = agentLoopRunContext.agentConfiguration;
  const mainConversation = agentLoopRunContext.conversation;
  const maxChars = 100_000;
  const toSummarize = content.slice(0, maxChars);

  const convRes = await api.createConversation({
    title: `Summary of web page content (main conversation: ${mainConversation.sId})`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: `Summarize the following web page content.\n\n` + toSummarize,
      mentions: [{ configurationId: summaryAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        origin: "run_agent",
        selectedMCPServerViewIds: null,
      },
    },
    params: { execution: "async" },
  });

  if (convRes.isErr() || !convRes.value.message) {
    return new Err(new Error("Failed to create summary conversation"));
  }

  const { conversation, message } = convRes.value;
  const streamRes = await api.streamAgentAnswerEvents({
    conversation,
    userMessageId: message.sId,
    options: {
      maxReconnectAttempts: 5,
      reconnectDelay: 5000,
      autoReconnect: true,
    },
  });
  if (streamRes.isErr()) {
    return new Err(
      new Error(`Failed to stream summary: ${streamRes.error.message}`)
    );
  }

  let finalContent = "";

  for await (const event of streamRes.value.eventStream) {
    if (
      event.type === "generation_tokens" &&
      event.classification === "tokens"
    ) {
      finalContent += event.text;
    } else if (event.type === "agent_message_success") {
      break;
    }
  }

  finalContent = finalContent.trim();
  if (!finalContent) {
    return new Err(new Error("Summary agent returned empty content"));
  }
  return new Ok(finalContent);
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("web_search_&_browse_with_summary");

  server.tool(
    WEBSEARCH_TOOL_NAME,
    "A tool that performs a Google web search based on a string query.",
    {
      query: z
        .string()
        .describe(
          "The query used to perform the Google search. If requested by the " +
            "user, use the Google syntax `site:` to restrict the search " +
            "to a particular website or domain."
        ),
      page: z
        .number()
        .optional()
        .describe(
          "A 1-indexed page number used to paginate through the search results." +
            " Should only be provided if the page is strictly greater than 1 in order" +
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

      const { websearchResultCount, citationsOffset } =
        agentLoopRunContext.stepContext;

      const websearchRes = await webSearch({
        provider: "serpapi",
        query,
        page,
        num: websearchResultCount,
      });

      if (websearchRes.isErr()) {
        return makeMCPToolTextError(
          `Failed to search: ${websearchRes.error.message}`
        );
      }

      const refs = getRefs().slice(
        citationsOffset,
        citationsOffset + websearchResultCount
      );

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
    WEBBROWSER_TOOL_NAME,
    "A tool to browse websites. Provide a list of URLs to browse. For each URL, the tool will return a summary of the content and a link to a file that contains the entire content.",
    {
      urls: z.string().array().describe("List of urls to browse"),
      summaryAgent:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
    },
    async ({ urls, summaryAgent }) => {
      if (!agentLoopContext?.runContext) {
        throw new Error("Unreachable: missing agentLoopContext.");
      }
      const summaryAgentId = parseAgentConfigurationUri(summaryAgent.uri);
      if (!summaryAgentId) {
        return makeMCPToolTextError(
          `Invalid URI for an agent configuration: ${summaryAgent.uri}`
        );
      }
      const runCtx = agentLoopContext.runContext;
      const conversationId = runCtx.conversation.sId;
      const { citationsOffset, websearchResultCount } = runCtx.stepContext;
      const refs = getRefs().slice(
        citationsOffset,
        citationsOffset + websearchResultCount
      );
      const results = await browseUrls(urls, 8, "markdown");

      const perUrlContents = await concurrentExecutor(
        results,
        async (result) => {
          const contentBlocks: CallToolResult["content"] = [];

          if (!isBrowseScrapeSuccessResponse(result)) {
            const errText = `Browse error (${result.status}) for ${result.url}: ${result.error}`;
            contentBlocks.push({ type: "text", text: errText });
            return contentBlocks;
          }

          const { markdown, title } = result;
          const fileContent = markdown ?? "";

          const snippetRes = await summarizeWithAgent({
            auth,
            agentLoopRunContext: runCtx,
            summaryAgentId,
            content: fileContent,
          });
          if (snippetRes.isErr()) {
            contentBlocks.push({
              type: "text",
              text: `Failed to summarize content for ${result.url}: ${snippetRes.error.message}`,
            });
            return contentBlocks;
          }
          const snippet = snippetRes.value.slice(
            0,
            MAXED_OUTPUT_FILE_SNIPPET_LENGTH
          );

          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          const baseTitle = title || result.url;
          const fileTitle = `${baseTitle}`;
          const file = await generatePlainTextFile(auth, {
            title: fileTitle,
            conversationId,
            content: fileContent,
            snippet,
          });

          await uploadFileToConversationDataSource({ auth, file });

          contentBlocks.push({
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              fileId: file.sId,
              title: fileTitle,
              contentType: file.contentType,
              snippet,
              uri: file.getPublicUrl(auth),
              text: "Web page content archived as a file.",
              hidden: true,
            },
          });

          const ref = refs.shift();
          if (ref) {
            contentBlocks.push({
              type: "resource",
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
                title: title ?? result.url,
                text: `Full web page content available as file ${file.sId}`,
                uri: result.url,
                reference: ref,
              },
            });
          }

          return contentBlocks;
        },
        { concurrency: 8 }
      );

      return { isError: false, content: perUrlContents.flat() };
    }
  );

  return server;
};

export default createServer;
