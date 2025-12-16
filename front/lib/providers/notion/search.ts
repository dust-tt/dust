import { isFullBlock, isFullPage } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

import {
  PROVIDER_DOWNLOAD_MAX_FILE_SIZE,
  PROVIDER_SEARCH_MAX_PAGE_SIZE,
} from "@app/lib/providers/constants";
import { getNotionClient } from "@app/lib/providers/notion/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";

// Maximum time to spend extracting content (in milliseconds)
const MAX_EXTRACTION_TIME_MS = 5000;

function getPageTitle(page: PageObjectResponse): string {
  const titleProperty = Object.values(page.properties).find(
    (prop) => prop.type === "title"
  );
  if (titleProperty && titleProperty.type === "title") {
    return titleProperty.title.map((t) => t.plain_text).join("") || "Untitled";
  }
  return "Untitled";
}

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const notion = getNotionClient(accessToken);

  const response = await notion.search({
    query,
    page_size: Math.min(pageSize, PROVIDER_SEARCH_MAX_PAGE_SIZE),
    filter: {
      property: "object",
      // We only support pages, as databases would require getting too much data
      value: "page",
    },
    sort: {
      direction: "descending",
      timestamp: "last_edited_time",
    },
  });

  return response.results.filter(isFullPage).map((page) => {
    return {
      externalId: page.id,
      mimeType: "application/vnd.notion.page",
      title: getPageTitle(page),
      type: "document",
      sourceUrl: page.url,
    };
  });
}

function extractBlockDirectContent(
  block: BlockObjectResponse,
  depth: number
): string {
  // Indentation based on the nesting level
  let content = "  ".repeat(depth);

  // Extract markup-like text content based on block type
  switch (block.type) {
    case "paragraph":
      content +=
        block.paragraph.rich_text.map((t) => t.plain_text).join("") + "\n\n";
      break;
    case "heading_1":
      content +=
        "# " +
        block.heading_1.rich_text.map((t) => t.plain_text).join("") +
        "\n\n";
      break;
    case "heading_2":
      content +=
        "## " +
        block.heading_2.rich_text.map((t) => t.plain_text).join("") +
        "\n\n";
      break;
    case "heading_3":
      content +=
        "### " +
        block.heading_3.rich_text.map((t) => t.plain_text).join("") +
        "\n\n";
      break;
    case "bulleted_list_item":
      content +=
        "- " +
        block.bulleted_list_item.rich_text.map((t) => t.plain_text).join("") +
        "\n";
      break;
    case "numbered_list_item":
      content +=
        "1. " +
        block.numbered_list_item.rich_text.map((t) => t.plain_text).join("") +
        "\n";
      break;
    case "to_do":
      const checkbox = block.to_do.checked ? "[x]" : "[ ]";
      content += `${checkbox} ${block.to_do.rich_text.map((t) => t.plain_text).join("")}\n`;
      break;
    case "toggle":
      content +=
        block.toggle.rich_text.map((t) => t.plain_text).join("") + "\n";
      break;
    case "code":
      content += "```" + (block.code.language ?? "") + "\n";
      content += block.code.rich_text.map((t) => t.plain_text).join("") + "\n";
      content += "```\n\n";
      break;
    case "quote":
      content +=
        "> " + block.quote.rich_text.map((t) => t.plain_text).join("") + "\n\n";
      break;
    case "callout":
      content +=
        block.callout.rich_text.map((t) => t.plain_text).join("") + "\n\n";
      break;
    case "divider":
      content += "---\n\n";
      break;
  }

  return content;
}

async function extractBlockContent(
  notion: ReturnType<typeof getNotionClient>,
  blockId: string,
  depth = 0,
  deadline?: number
): Promise<string> {
  const now = Date.now();

  // Check if we've exceeded the deadline
  if (deadline && now >= deadline) {
    logger.warn(
      {
        blockId,
        depth,
      },
      "Notion extractBlockContent: Exceeded deadline, stopping extraction"
    );
    return "";
  }

  // Fetch all pages of blocks (handling pagination)
  const allBlocks: (BlockObjectResponse | PartialBlockObjectResponse)[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    // Check deadline before fetching next page
    if (deadline && Date.now() >= deadline) {
      logger.warn(
        {
          blockId,
          blocksFetched: allBlocks.length,
        },
        "Notion extractBlockContent: Exceeded deadline during pagination, stopping"
      );
      break;
    }

    const response = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100,
      start_cursor: cursor,
    });

    allBlocks.push(...response.results);
    hasMore = response.has_more;
    cursor = response.next_cursor ?? undefined;
  }

  logger.info(
    {
      blockId,
      blockCount: allBlocks.length,
      durationMs: Date.now() - now,
    },
    "Notion extractBlockContent: Fetched all children for block"
  );

  // Process all blocks and create promises for child content concurrently
  const blockContentPromises = allBlocks.map(async (block) => {
    if (!isFullBlock(block)) {
      return "";
    }

    // Extract direct content for this block (no Notion calls)
    const directContent = extractBlockDirectContent(block, depth);

    // Recursively extract child blocks, up to a reasonable depth, and respecting the deadline
    let childContent = "";
    if (block.has_children && depth < 10) {
      if (!deadline || Date.now() < deadline) {
        childContent = await extractBlockContent(
          notion,
          block.id,
          depth + 1,
          deadline
        );
      } else {
        logger.warn(
          {
            blockId: block.id,
            depth: depth + 1,
          },
          "Notion extractBlockContent: Skipping child extraction due to deadline"
        );
      }
    }

    return directContent + childContent;
  });

  // Wait for all blocks to be processed (children are fetched concurrently)
  const blockContents = await Promise.all(blockContentPromises);

  return blockContents.join("");
}

export async function download({
  accessToken,
  externalId,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const now = Date.now();
  const notion = getNotionClient(accessToken);

  // Fetch page metadata
  const page = await notion.pages.retrieve({ page_id: externalId });

  if (!isFullPage(page)) {
    throw new Error("Page metadata is incomplete.");
  }

  const title = getPageTitle(page);

  // Extract all content from the page and render it as markdown-like text
  // Set a deadline to avoid spending too much time on large pages
  const deadline = Date.now() + MAX_EXTRACTION_TIME_MS;
  const content = await extractBlockContent(notion, externalId, 0, deadline);

  // Check content size
  const contentSize = Buffer.byteLength(content, "utf8");
  if (contentSize > PROVIDER_DOWNLOAD_MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${PROVIDER_DOWNLOAD_MAX_FILE_SIZE / (1024 * 1024)} MB.`
    );
  }
  logger.info(
    {
      externalId,
      durationMs: Date.now() - now,
    },
    "Notion: Downloaded page content"
  );

  return {
    content,
    fileName: title,
    contentType: "text/markdown",
  };
}
