import { isFullBlock, isFullPage } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

import {
  getNotionClient,
  MAX_FILE_SIZE,
} from "@app/lib/providers/notion/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";

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
    page_size: Math.min(pageSize, 100),
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
  depth = 0
): Promise<string> {
  const now = Date.now();

  // Right now, we only handle the first page of results. We should get more, as long
  // as we can do it within some time limit.
  const response = await notion.blocks.children.list({
    block_id: blockId,
    page_size: 100,
  });
  logger.info(
    {
      blockId,
      durationMs: Date.now() - now,
    },
    "Notion: Fetched children for block"
  );

  // Process all blocks and create promises for child content concurrently
  const blockContentPromises = response.results.map(async (block) => {
    if (!isFullBlock(block)) {
      return "";
    }

    // Extract direct content for this block
    const directContent = extractBlockDirectContent(block, depth);

    // Recursively fetch child blocks if they exist, up to a reasonable depth
    let childContent = "";
    if (block.has_children && depth < 10) {
      childContent = await extractBlockContent(notion, block.id, depth + 1);
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
  const content = await extractBlockContent(notion, externalId);

  // Check content size
  const contentSize = Buffer.byteLength(content, "utf8");
  if (contentSize > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
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
    mimeType: "application/vnd.notion.page",
  };
}
