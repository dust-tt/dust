import {
  APIResponseError,
  Client,
  collectPaginatedAPI,
  isFullBlock,
  isFullDatabase,
  isFullPage,
  iteratePaginatedAPI,
} from "@notionhq/client";
import {
  BlockObjectResponse,
  GetPageResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
  SearchResponse,
} from "@notionhq/client/build/src/api-endpoints";

import { cacheGet, cacheSet } from "@connectors/lib/cache";
import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({ provider: "notion" });

// notion SDK types
type PageObjectProperties = PageObjectResponse["properties"];
type PropertyKeys = keyof PageObjectProperties;
type PropertyTypes = PageObjectProperties[PropertyKeys]["type"];

// Extractor types
export interface ParsedPage {
  id: string;
  url: string;
  properties: ParsedProperty[];
  blocks: ParsedBlock[];
  rendered: string;
  createdTime: number;
  updatedTime: number;
  author: string;
  lastEditor: string;
  hasBody: boolean;
}

export type ParsedProperty = {
  key: string;
  id: string;
  type: PropertyTypes;
  text: string | null;
};
type ParsedBlock = {
  id: string;
  type: BlockObjectResponse["type"];
  text: string | null;
};

/**
 * @param notionAccessToken the access token to use to access the Notion API
 * @param sinceTs a millisecond timestamp representing the minimum last edited time of
 * pages to return. If null, all pages will be returned.
 * @param cursor a cursor to use to fetch the next page of results. If null, the first
 * page of results will be returned.
 * @param loggerArgs arguments to pass to the logger
 * @param retry options for retrying the request
 * @returns a promise that resolves to an array of page IDs and the next cursor
 */
export async function getPagesEditedSince(
  notionAccessToken: string,
  sinceTs: number | null,
  cursor: string | null,
  loggerArgs: Record<string, string | number> = {},
  retry: { retries: number; backoffFactor: number } = {
    retries: 5,
    backoffFactor: 2,
  }
): Promise<{ pageIds: string[]; nextCursor: string | null }> {
  const localLogger = logger.child(loggerArgs);

  const notionClient = new Client({ auth: notionAccessToken });
  const editedPages: Set<string> = new Set();
  let resultsPage: SearchResponse | null = null;

  let tries = 0;
  while (tries < retry.retries) {
    const tryLogger = localLogger.child({ tries, maxTries: retry.retries });
    tryLogger.info("Fetching result page from Notion API.");
    try {
      resultsPage = await notionClient.search({
        sort: sinceTs
          ? {
              timestamp: "last_edited_time",
              direction: "descending",
            }
          : undefined,
        start_cursor: cursor || undefined,
      });
      tryLogger.info(
        { count: resultsPage.results.length },
        "Received result page from Notion API."
      );
    } catch (e) {
      tryLogger.error(
        { error: e },
        "Error fetching result page from Notion API."
      );
      tries += 1;
      if (tries >= retry.retries) {
        throw e;
      }
      const sleepTime = 500 * retry.backoffFactor ** tries;
      tryLogger.info({ sleepTime }, "Sleeping before retrying.");
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
      continue;
    }
    break;
  }

  if (!resultsPage) {
    throw new Error("No results page returned from Notion API.");
  }

  for (const pageOrDb of resultsPage.results) {
    if (pageOrDb.object === "page") {
      if (isFullPage(pageOrDb)) {
        const lastEditedTime = new Date(pageOrDb.last_edited_time).getTime();
        if (sinceTs && lastEditedTime < sinceTs) {
          break;
        }
        editedPages.add(pageOrDb.id);
      }
    } else if (pageOrDb.object === "database") {
      if (isFullDatabase(pageOrDb)) {
        const lastEditedTime = new Date(pageOrDb.last_edited_time).getTime();
        if (sinceTs && lastEditedTime < sinceTs) {
          break;
        }
        try {
          for await (const child of iteratePaginatedAPI(
            notionClient.databases.query,
            {
              database_id: pageOrDb.id,
            }
          )) {
            if (isFullPage(child)) {
              editedPages.add(child.id);
            }
          }
        } catch (e) {
          if (
            APIResponseError.isAPIResponseError(e) &&
            e.code === "object_not_found"
          ) {
            continue;
          }
          throw e;
        }
      }
    }
  }

  return {
    pageIds: Array.from(editedPages),
    nextCursor: resultsPage.has_more ? resultsPage.next_cursor : null,
  };
}

export async function getParsedPage(
  notionAccessToken: string,
  pageId: string
): Promise<ParsedPage | null> {
  const notionClient = new Client({ auth: notionAccessToken });

  let page: GetPageResponse | null = null;

  try {
    page = await notionClient.pages.retrieve({ page_id: pageId });
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      return null;
    }
    throw e;
  }

  if (!isFullPage(page)) {
    throw new Error("Page is not a full page");
  }

  logger.info({ pageUrl: page.url, pageId: page.id }, "Parsing page.");
  const properties = Object.entries(page.properties).map(([key, value]) => ({
    key,
    id: value.id,
    type: value.type,
    text: parsePropertyText(value),
  }));

  let blocks: (BlockObjectResponse | PartialBlockObjectResponse)[] | null =
    null;

  try {
    blocks = await collectPaginatedAPI(notionClient.blocks.children.list, {
      block_id: page.id,
    });
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      blocks = [];
    }
    throw e;
  }

  let parsedBlocks: ParsedBlock[] = [];
  for (const block of blocks) {
    if (isFullBlock(block)) {
      parsedBlocks = parsedBlocks.concat(
        await parsePageBlock(block, notionClient)
      );
    }
  }

  let renderedPage = "";
  for (const property of properties) {
    if (!property.text) continue;
    renderedPage += `$${property.key}: ${property.text}\n`;
  }

  renderedPage += "\n";
  for (const parsedBlock of parsedBlocks) {
    if (!parsedBlock.text) continue;
    renderedPage += `${parsedBlock.text}\n`;
  }

  const pageHasBody = !parsedBlocks.every((b) => !b.text);

  const author =
    (await getUserName(notionClient, page.created_by.id)) || page.created_by.id;
  const lastEditor =
    (await getUserName(notionClient, page.last_edited_by.id)) ||
    page.last_edited_by.id;

  return {
    id: page.id,
    url: page.url,
    properties,
    blocks: parsedBlocks,
    rendered: renderedPage,
    createdTime: new Date(page.created_time).getTime(),
    updatedTime: new Date(page.last_edited_time).getTime(),
    author,
    lastEditor,
    hasBody: pageHasBody,
  };
}

export async function validateAccessToken(notionAccessToken: string) {
  const notionClient = new Client({ auth: notionAccessToken });
  try {
    await notionClient.search({ page_size: 1 });
  } catch (e) {
    return false;
  }
  return true;
}

function parsePropertyText(
  property: PageObjectProperties[PropertyKeys]
): string | null {
  switch (property.type) {
    case "number":
      return property.number?.toString() || null;
    case "url":
      return property.url || null;
    case "select":
      return property.select?.name || null;
    case "multi_select":
      return property.multi_select.length > 0
        ? property.multi_select.map((select) => select.name).join(", ")
        : null;
    case "status":
      return property.status?.name || null;
    case "date":
      if (property.date?.start && property.date?.end) {
        return `${property.date.start} - ${property.date.end}`;
      }
      return property.date?.start || null;
    case "email":
      return property.email || null;
    case "phone_number":
      return property.phone_number || null;
    case "checkbox":
      return property.checkbox ? "Yes" : "No";
    case "files":
      return property.files.length > 0
        ? property.files
            .map((f) => ({
              name: f.name,
              url: "external" in f ? f.external.url : f.file.url,
            }))
            .map(({ name, url }) => `[${name}](${url})`)
            .join(", ")
        : null;
    case "created_by":
      return "name" in property.created_by ? property.created_by?.name : null;
    case "created_time":
      return property.created_time;
    case "last_edited_by":
      return "name" in property.last_edited_by
        ? property.last_edited_by?.name
        : null;
    case "last_edited_time":
      return property.last_edited_time;
    case "title":
      return property.title.map((t) => t.plain_text).join(" ");
    case "rich_text":
      return property.rich_text.map((t) => t.plain_text).join(" ");
    case "people":
      return property.people.length > 0
        ? property.people.map((p) => ("name" in p ? p.name : p.id)).join(", ")
        : null;
    case "relation":
    case "rollup":
    case "formula":
    // @ts-expect-error missing from Notion package
    // eslint-disable-next-line no-fallthrough
    case "verification":
      return null;
    default:
      // `property` here is `never`
      ((property: never) => {
        logger.warn(
          { property_type: (property as { type: string }).type },
          "Unknown property type."
        );
      })(property);
      return null;
  }
}

async function renderChildDatabase(
  block: BlockObjectResponse & { type: "child_database" },
  notionClient: Client
): Promise<string | null> {
  const rows: string[] = [];
  let header: string[] | null = null;
  try {
    for await (const page of iteratePaginatedAPI(notionClient.databases.query, {
      database_id: block.id,
    })) {
      if (isFullPage(page)) {
        if (!header) {
          header = Object.entries(page.properties).map(([key]) => key);
          rows.push(`||${header.join(" | ")}||`);
        }

        const properties: Record<string, string> = Object.entries(
          page.properties
        )
          .map(([key, value]) => ({
            key,
            id: value.id,
            type: value.type,
            text: parsePropertyText(value),
          }))
          .reduce(
            (acc, property) =>
              Object.assign(acc, { [property.key]: property.text }),
            {}
          );

        rows.push(`||${header.map((k) => properties[k]).join(" | ")}||`);
      }
    }

    return [block.child_database.title, ...rows].join("\n");
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      return null;
    }
    throw e;
  }
}

async function getUserName(
  notionClient: Client,
  userId: string
): Promise<string | null> {
  const nameFromCache = await cacheGet(`notion-user-name:${userId}`);
  if (nameFromCache) {
    return nameFromCache;
  }

  try {
    const user = await notionClient.users.retrieve({
      user_id: userId,
    });
    if (!user) {
      return null;
    }
    if (user.name) {
      await cacheSet(`notion-user-name:${userId}`, user.name);
    }
    return user.name;
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      return null;
    }
    throw e;
  }
}

async function parsePageBlock(
  block: BlockObjectResponse,
  notionClient: Client
): Promise<ParsedBlock[]> {
  function parseRichText(text: RichTextItemResponse[]): string {
    const parsed = text.map((t) => t.plain_text).join(" ");
    return parsed;
  }

  function renderUrl(url: string, caption?: string | null): string {
    if (caption) {
      return `[${caption}](${url})`;
    }
    return url;
  }

  function renderFile(
    fileContainer: (
      | { file: { url: string } }
      | { external: { url: string } }
    ) & {
      caption: RichTextItemResponse[];
    }
  ): string {
    const fileUrl =
      "external" in fileContainer
        ? fileContainer.external.url
        : fileContainer.file.url;
    const caption = parseRichText(fileContainer.caption);
    const fileText =
      caption && caption.length
        ? `[${parseRichText(fileContainer.caption)}](${fileUrl})`
        : fileUrl;
    return fileText;
  }

  function indentBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
    const indentedBlocks: ParsedBlock[] = [];
    for (const { text, ...rest } of blocks) {
      const indentedText = text ? `- ${text}` : null;
      indentedBlocks.push({
        ...rest,
        text: indentedText,
      });
    }
    return indentedBlocks;
  }

  async function withPotentialChildren(
    parsedBlock: ParsedBlock,
    block: BlockObjectResponse
  ): Promise<ParsedBlock[]> {
    const parsedBlocks = [parsedBlock];
    if (!block.has_children) {
      return parsedBlocks;
    }

    let children: (BlockObjectResponse | PartialBlockObjectResponse)[] | null =
      null;
    try {
      children = await collectPaginatedAPI(notionClient.blocks.children.list, {
        block_id: block.id,
      });
    } catch (e) {
      if (
        APIResponseError.isAPIResponseError(e) &&
        e.code === "object_not_found"
      ) {
        return parsedBlocks;
      }
      throw e;
    }

    const parsedChildren = (
      await Promise.all(
        children.map(async (child) => {
          if (isFullBlock(child)) {
            return parsePageBlock(child, notionClient);
          }
          return [];
        })
      )
    ).flat();

    return parsedBlocks.concat(indentBlocks(parsedChildren));
  }

  const commonFields = {
    id: block.id,
    type: block.type,
  };

  const NULL_BLOCK = {
    ...commonFields,
    text: null,
  };

  switch (block.type) {
    case "column":
    case "breadcrumb":
    case "column_list":
    case "link_to_page":
    case "divider":
    case "table_of_contents":
    case "unsupported":
      // TODO: check if we want that ?
      return [NULL_BLOCK];

    case "equation":
      return [
        {
          ...commonFields,
          text: block.equation.expression,
        },
      ];

    case "link_preview":
      return [
        {
          ...commonFields,
          text: block.link_preview.url,
        },
      ];

    case "table_row":
      return [
        {
          ...commonFields,
          text: `||${block.table_row.cells.map(parseRichText).join(" | ")}||`,
        },
      ];

    case "code":
      return [
        {
          ...commonFields,
          text: `\`\`\`${block.code.language} ${parseRichText(
            block.code.rich_text
          )} \`\`\``,
        },
      ];

    // child databases are a special case
    // we need to fetch all the pages in the database to reconstruct the table
    case "child_database":
      return [
        {
          ...commonFields,
          text: await renderChildDatabase(block, notionClient),
        },
      ];

    // URL blocks
    case "bookmark":
      return [
        {
          ...commonFields,
          text: block.bookmark
            ? renderUrl(
                block.bookmark.url,
                parseRichText(block.bookmark.caption)
              )
            : null,
        },
      ];
    case "embed":
      return [
        {
          ...commonFields,
          text: renderUrl(block.embed.url, parseRichText(block.embed.caption)),
        },
      ];

    // File blocks
    case "file":
      return [
        {
          ...commonFields,
          text: renderFile(block.file),
        },
      ];
    case "image":
      return [
        {
          ...commonFields,
          text: renderFile(block.image),
        },
      ];
    case "pdf":
      return [
        {
          ...commonFields,
          text: renderFile(block.pdf),
        },
      ];
    case "video":
      return [
        {
          ...commonFields,
          text: renderFile(block.video),
        },
      ];

    case "audio":
      return [
        {
          ...commonFields,
          text: renderFile(block.audio),
        },
      ];

    // blocks that may have child blocks:
    case "table":
      return withPotentialChildren(NULL_BLOCK, block);

    case "bulleted_list_item":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `* ${parseRichText(block.bulleted_list_item.rich_text)}`,
        },
        block
      );
    case "callout":
      return withPotentialChildren(
        {
          ...commonFields,
          text: parseRichText(block.callout.rich_text),
        },
        block
      );
    case "heading_1":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `# ${parseRichText(block.heading_1.rich_text).replace(
            "\n",
            " "
          )}`,
        },
        block
      );

    case "heading_2":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `## ${parseRichText(block.heading_2.rich_text).replace(
            "\n",
            " "
          )}`,
        },
        block
      );
    case "heading_3":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `### ${parseRichText(block.heading_3.rich_text).replace(
            "\n",
            " "
          )}`,
        },
        block
      );
    case "numbered_list_item":
      return withPotentialChildren(
        {
          ...commonFields,
          text: parseRichText(block.numbered_list_item.rich_text),
        },
        block
      );
    case "paragraph":
      return withPotentialChildren(
        {
          ...commonFields,
          text: parseRichText(block.paragraph.rich_text),
        },
        block
      );
    case "quote":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `> ${parseRichText(block.quote.rich_text)}`,
        },
        block
      );
    case "template":
      return withPotentialChildren(
        {
          ...commonFields,
          text: parseRichText(block.template.rich_text),
        },
        block
      );
    case "to_do":
      return withPotentialChildren(
        {
          ...commonFields,
          text: `[${block.to_do.checked ? "x" : " "}] ${parseRichText(
            block.to_do.rich_text
          )}`,
        },
        block
      );

    case "toggle":
      return withPotentialChildren(
        {
          ...commonFields,
          text: parseRichText(block.toggle.rich_text),
        },
        block
      );

    case "synced_block":
      return withPotentialChildren(NULL_BLOCK, block);

    // blocks that technically have children but we don't want to recursively parse them
    // because the search endpoint returns them already
    case "child_page":
      return [
        {
          ...commonFields,
          text: block.child_page.title,
        },
      ];

    default:
      // `block` here is `never`
      ((block: never) => {
        logger.warn(
          { type: (block as { type: string }).type },
          "Unknown block type."
        );
      })(block);
      return [NULL_BLOCK];
  }
}
