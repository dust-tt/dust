import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MAXED_OUTPUT_FILE_SNIPPET_LENGTH } from "@app/lib/actions/action_output_limits";
import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  WEBBROWSER_TOOL_NAME,
  WEBSEARCH_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  BrowseResultResourceType,
  WebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  WebbrowseInputSchema,
  WebsearchInputSchema,
} from "@app/lib/actions/mcp_internal_actions/types";
import { summarizeWithAgent } from "@app/lib/actions/mcp_internal_actions/utils/web_summarization";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import { Err, GLOBAL_AGENTS_SID, GPT_4O_MODEL_CONFIG, Ok } from "@app/types";

const BROWSE_MAX_TOKENS_LIMIT = 32_000;
const DEFAULT_WEBSEARCH_MODEL_CONFIG = GPT_4O_MODEL_CONFIG;

export function registerWebSearchTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined
) {
  server.tool(
    WEBSEARCH_TOOL_NAME,
    "A tool that performs a Google web search based on a string query.",
    WebsearchInputSchema.shape,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: WEBSEARCH_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ query }) => {
        if (!agentLoopContext?.runContext) {
          throw new Error(
            "agentLoopRunContext is required where the tool is called."
          );
        }

        const agentLoopRunContext = agentLoopContext.runContext;

        const { websearchResultCount, citationsOffset } =
          agentLoopRunContext.stepContext;

        const websearchRes = await webSearch({
          provider: "firecrawl",
          query,
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

        return new Ok(
          results.map((result) => ({
            type: "resource" as const,
            resource: result,
          }))
        );
      }
    )
  );
}

export function registerWebBrowserTool(
  auth: Authenticator,
  server: McpServer,
  agentLoopContext: AgentLoopContextType | undefined
) {
  server.tool(
    WEBBROWSER_TOOL_NAME,
    "A tool to browse websites, you can provide a list of urls to browse all at once.",
    WebbrowseInputSchema.shape,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: WEBBROWSER_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ urls, format = "markdown", screenshotMode = "none", links }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("No conversation context available"));
        }

        const { toolConfiguration } = agentLoopContext.runContext;
        const useSummarization =
          isLightServerSideMCPToolConfiguration(toolConfiguration) &&
          toolConfiguration.additionalConfiguration.useSummarization === true;

        const summaryAgentId = useSummarization
          ? GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY
          : null;

        const results = await browseUrls(urls, 8, format, {
          screenshotMode,
          links,
        });

        if (useSummarization && summaryAgentId) {
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

              return contentBlocks;
            },
            { concurrency: 8 }
          );

          return new Ok(perUrlContents.flatMap((contents) => contents));
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
            providerId: DEFAULT_WEBSEARCH_MODEL_CONFIG.providerId,
            modelId: DEFAULT_WEBSEARCH_MODEL_CONFIG.modelId,
            tokenizer: DEFAULT_WEBSEARCH_MODEL_CONFIG.tokenizer,
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
}
