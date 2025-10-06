import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MAXED_OUTPUT_FILE_SNIPPET_LENGTH } from "@app/lib/actions/action_output_limits";
import { DEFAULT_WEBSEARCH_ACTION_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  BrowseResultResourceType,
  WebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { summarizeWithAgent } from "@app/lib/actions/mcp_internal_actions/utils/web_summarization";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import { Err, GLOBAL_AGENTS_SID, Ok } from "@app/types";

const BROWSE_MAX_TOKENS_LIMIT = 32_000;

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer(DEFAULT_WEBSEARCH_ACTION_NAME);

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
    withToolLogging(
      auth,
      { toolName: WEBSEARCH_TOOL_NAME, agentLoopContext },
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
          return new Err(
            new MCPError(`Failed to search: ${websearchRes.error.message}`)
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

        return new Ok([
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
        ]);
      }
    )
  );

  server.tool(
    WEBBROWSER_TOOL_NAME,
    "A tool to browse websites, you can provide a list of urls to browse all at once.",
    {
      urls: z.string().array().describe("List of urls to browse"),
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
      useSummary: ConfigurableToolInputSchemas[
        INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN
      ]
        .describe(
          "Summarize web pages using an AI agent before returning content. When enabled, provides concise summaries instead of full page content."
        )
        .default({
          value: false,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
        }),
    },
    withToolLogging(
      auth,
      { toolName: WEBBROWSER_TOOL_NAME, agentLoopContext },
      async ({
        urls,
        format = "markdown",
        screenshotMode = "none",
        links,
        useSummary,
      }) => {
        const useSummarization = useSummary?.value === true;

        if (useSummarization && !agentLoopContext?.runContext) {
          return new Err(
            new MCPError("agentLoopContext is required for summarization")
          );
        }

        const summaryAgentId = useSummarization
          ? GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY
          : null;

        const results = await browseUrls(urls, 8, format, {
          screenshotMode,
          links,
        });

        if (
          useSummarization &&
          summaryAgentId &&
          agentLoopContext?.runContext
        ) {
          const runCtx = agentLoopContext.runContext;
          const conversationId = runCtx.conversation.sId;
          const { citationsOffset, websearchResultCount } = runCtx.stepContext;
          const refs = getRefs().slice(
            citationsOffset,
            citationsOffset + websearchResultCount
          );

          const perUrlContents = await concurrentExecutor(
            results,
            async (result) => {
              const contentBlocks: CallToolResult["content"] = [];
              let isSuccess = false;

              if (!isBrowseScrapeSuccessResponse(result)) {
                const errText = `Browse error (${result.status}) for ${result.url}: ${result.error}`;
                contentBlocks.push({ type: "text", text: errText });
                return { contentBlocks, isSuccess };
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
                return { contentBlocks, isSuccess };
              }

              isSuccess = true;
              const snippet = snippetRes.value.slice(
                0,
                MAXED_OUTPUT_FILE_SNIPPET_LENGTH
              );

              const baseTitle = title ?? result.url;
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

              return { contentBlocks, isSuccess };
            },
            { concurrency: 8 }
          );

          const hasAnySuccess = perUrlContents.some(
            (result) => result.isSuccess
          );
          if (!hasAnySuccess) {
            return new Err(
              new MCPError("All web browsing and summarization attempts failed")
            );
          }

          return new Ok(
            perUrlContents.flatMap((result) => result.contentBlocks)
          );
        }

        const toolContent: CallToolResult["content"] = [];
        for (const result of results) {
          if (!isBrowseScrapeSuccessResponse(result)) {
            const errText = `Browse error (${result.status}) for ${result.url}: ${result.error}`;
            toolContent.push({
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
                requestedUrl: result.url,
                uri: result.url,
                text: errText,
                responseCode: result.status.toString(),
                errorMessage: result.error,
              },
            });
            continue;
          }

          const {
            markdown,
            html,
            title,
            description,
            screenshots: allScreenshots,
            links: outLinks,
          } = result;
          const contentText = format === "html" ? html : markdown;

          const tokensRes = await tokenCountForTexts([contentText ?? ""], {
            providerId: "openai",
            modelId: "gpt-4o",
          });

          if (tokensRes.isErr()) {
            toolContent.push({
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
                requestedUrl: result.url,
                uri: result.url,
                text: "There was an error while browsing the website.",
                title: title,
                description: description,
                responseCode: result.status.toString(),
                errorMessage: tokensRes.error.message,
              },
            });
            continue;
          }

          const tokensCount = tokensRes.value[0];
          const avgCharactersPerToken =
            (contentText?.length ?? 0) / tokensCount;
          const maxCharacters = BROWSE_MAX_TOKENS_LIMIT * avgCharactersPerToken;
          let truncatedContent = contentText?.slice(0, maxCharacters);

          if (truncatedContent?.length !== contentText?.length) {
            truncatedContent += `\n\n[...output truncated to ${BROWSE_MAX_TOKENS_LIMIT} tokens]`;
          }

          const browseResult: BrowseResultResourceType = {
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
            requestedUrl: result.url,
            uri: result.url,
            text:
              truncatedContent ??
              "There was an error while browsing the website.",
            title: title,
            description: description,
            responseCode: result.status.toString(),
          };

          // Include HTML content when format is HTML
          if (format === "html" && html) {
            browseResult.html = html.slice(0, maxCharacters);
          }

          toolContent.push({
            type: "resource" as const,
            resource: browseResult,
          });

          if (Array.isArray(outLinks) && outLinks.length > 0) {
            toolContent.push({
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
                requestedUrl: result.url,
                uri: result.url,
                text: `Links (first 50):\n${outLinks.slice(0, 50).join("\n")}`,
                title,
                description,
                responseCode: result.status.toString(),
              },
            });
          }

          if (Array.isArray(allScreenshots) && allScreenshots.length > 0) {
            for (const raw of allScreenshots) {
              const isUrl = /^https?:\/\//i.test(raw);
              let base64 = raw;
              if (raw.startsWith("data:image")) {
                base64 = raw.split(",")[1] ?? "";
              }
              base64 = base64.replace(/\s+/g, "");
              const isValidBase64 =
                base64.length > 0 &&
                base64.length % 4 === 0 &&
                /^[A-Za-z0-9+/]+={0,2}$/.test(base64);

              if (isValidBase64) {
                toolContent.push({
                  type: "image",
                  mimeType: "image/png",
                  data: base64,
                });
              } else if (isUrl) {
                toolContent.push({
                  type: "resource",
                  resource: {
                    mimeType: "image/png",
                    uri: raw,
                    text: "Screenshot (remote URL)",
                  },
                });
              } else if (screenshotMode !== "none") {
                toolContent.push({
                  type: "resource",
                  resource: {
                    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
                    requestedUrl: result.url,
                    uri: result.url,
                    text: "Screenshot returned but not valid base64 or URL; skipping upload.",
                    title,
                    description,
                    responseCode: result.status.toString(),
                  },
                });
              }
            }
          } else if (screenshotMode !== "none") {
            // If screenshot was requested but not returned, surface a diagnostic message
            toolContent.push({
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
                requestedUrl: result.url,
                uri: result.url,
                text: `Screenshot requested (mode=${screenshotMode}) but none was returned by Firecrawl.`,
                title,
                description,
                responseCode: result.status.toString(),
              },
            });
          }
        }

        return new Ok(toolContent);
      }
    )
  );

  return server;
};

export default createServer;
