// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  generatePlainTextFile,
  uploadFileToConversationDataSource,
} from "@app/lib/actions/action_file_helpers";
import { MAXED_OUTPUT_FILE_SNIPPET_LENGTH } from "@app/lib/actions/action_output_limits";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { USE_SUMMARY_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  BrowseResultResourceType,
  WebsearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  summarizeWithAgent,
  summarizeWithLLM,
} from "@app/lib/actions/mcp_internal_actions/utils/web_summarization";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { WEB_SEARCH_BROWSE_TOOLS_METADATA } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { getRefs } from "@app/lib/api/assistant/citations";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  browseUrls,
  isBrowseScrapeSuccessResponse,
} from "@app/lib/utils/webbrowse";
import { webSearch } from "@app/lib/utils/websearch";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { GPT_4O_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const MIN_CHARACTERS_TO_SUMMARIZE = 16_000;
const BROWSE_MAX_TOKENS_LIMIT = 32_000;
const DEFAULT_WEBSEARCH_MODEL_CONFIG = GPT_4O_MODEL_CONFIG;

async function handleWebsearch(
  { query }: { query: string },
  extra: ToolHandlerExtra
) {
  const { agentLoopContext } = extra;
  if (!agentLoopContext?.runContext) {
    return new Err(
      new MCPError("agentLoopRunContext is required where the tool is called.")
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
      reference: refs.shift() ?? "",
    });
  }

  return new Ok(
    results.map((result) => ({
      type: "resource" as const,
      resource: result,
    }))
  );
}

async function handleWebbrowser(
  {
    urls,
    format = "markdown",
    screenshotMode = "none",
    links,
  }: {
    urls: string[];
    format?: "markdown" | "html";
    screenshotMode?: "none" | "viewport" | "fullPage";
    links?: boolean;
  },
  extra: ToolHandlerExtra
) {
  const { agentLoopContext, auth } = extra;
  if (!agentLoopContext?.runContext) {
    return new Err(new MCPError("No conversation context available"));
  }
  const { toolConfiguration } = agentLoopContext.runContext;
  const useSummarization =
    isLightServerSideMCPToolConfiguration(toolConfiguration) &&
    toolConfiguration.additionalConfiguration[USE_SUMMARY_SWITCH] === true;

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

        const startTime = Date.now();
        const summarizationMethod: "none" | "agent" | "llm" =
          fileContent.length <= MIN_CHARACTERS_TO_SUMMARIZE
            ? "none"
            : Math.random() < 0.5
              ? "agent"
              : "llm";

        let snippetRes: Result<string, Error> | null = null;

        switch (summarizationMethod) {
          case "none":
            snippetRes = new Ok(fileContent);
            break;
          case "agent":
            snippetRes = await summarizeWithAgent({
              auth,
              agentLoopRunContext: runCtx,
              summaryAgentId,
              content: fileContent,
            });
            break;
          case "llm":
            snippetRes = await summarizeWithLLM({
              auth,
              content: fileContent,
              agentLoopRunContext: runCtx,
            });
            break;
          default:
            assertNever(summarizationMethod);
        }

        if (snippetRes.isErr()) {
          contentBlocks.push({
            type: "text",
            text: `Failed to summarize content for ${result.url}: ${snippetRes.error.message}`,
          });
          return contentBlocks;
        }

        logger.info(
          {
            url: result.url,
            summarizationMethod,
            contentLength: fileContent.length,
            snippetLength: snippetRes.value.length,
            duration: Date.now() - startTime,
          },
          "Summarized content"
        );

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

        const fileResource = {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: file.sId,
          title: fileTitle,
          contentType: file.contentType,
          snippet,
          uri: file.getPublicUrl(auth),
          text: "Web page content archived as a file.",
          hidden: true,
        };

        contentBlocks.push({
          type: "resource",
          resource: fileResource,
        });

        const ref = refs.shift();
        if (ref) {
          const websearchResultResource = {
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
            title: title ?? result.url,
            text: `Full web page content available as file ${file.sId}`,
            uri: result.url,
            reference: ref,
          };

          contentBlocks.push({
            type: "resource",
            resource: websearchResultResource,
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
      const browseResultResource = {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
        requestedUrl: result.url,
        uri: result.url,
        text: errText,
        responseCode: result.status.toString(),
        errorMessage: result.error,
      };
      toolContent.push({
        type: "resource" as const,
        resource: browseResultResource,
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
      const browseResultResource = {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
        requestedUrl: result.url,
        uri: result.url,
        text: "There was an error while browsing the website.",
        title: title,
        description: description,
        responseCode: result.status.toString(),
        errorMessage: tokensRes.error.message,
      };
      toolContent.push({
        type: "resource" as const,
        resource: browseResultResource,
      });
      continue;
    }

    const tokensCount = tokensRes.value[0];
    const avgCharactersPerToken = (contentText?.length ?? 0) / tokensCount;
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
        truncatedContent ?? "There was an error while browsing the website.",
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
      const browseResultResource = {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
        requestedUrl: result.url,
        uri: result.url,
        text: `Links (first 50):\n${outLinks.slice(0, 50).join("\n")}`,
        title: title,
        description: description,
        responseCode: result.status.toString(),
      };
      toolContent.push({
        type: "resource" as const,
        resource: browseResultResource,
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
          const browseResultResource = {
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
            requestedUrl: result.url,
            uri: result.url,
            text: "Screenshot returned but not valid base64 or URL; skipping upload.",
            title,
            description,
            responseCode: result.status.toString(),
          };
          toolContent.push({
            type: "resource",
            resource: browseResultResource,
          });
        }
      }
    } else if (screenshotMode !== "none") {
      // If screenshot was requested but not returned, surface a diagnostic message
      const browseResultResource = {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
        requestedUrl: result.url,
        uri: result.url,
        text: `Screenshot requested (mode=${screenshotMode}) but none was returned by Firecrawl.`,
        title,
        description,
        responseCode: result.status.toString(),
      };
      toolContent.push({
        type: "resource" as const,
        resource: browseResultResource,
      });
    }
  }

  return new Ok(toolContent);
}

const handlers: ToolHandlers<typeof WEB_SEARCH_BROWSE_TOOLS_METADATA> = {
  websearch: handleWebsearch,
  webbrowser: handleWebbrowser,
};

export const TOOLS = buildTools(WEB_SEARCH_BROWSE_TOOLS_METADATA, handlers);
