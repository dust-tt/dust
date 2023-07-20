import {
  APIResponseError,
  Client,
  collectPaginatedAPI,
  isFullBlock,
  isFullDatabase,
  isFullPage,
} from "@notionhq/client";
import {
  BlockObjectResponse,
  GetDatabaseResponse,
  GetPageResponse,
  PageObjectResponse,
  PartialBlockObjectResponse,
  RichTextItemResponse,
  SearchResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { Logger } from "pino";

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
  title?: string;
  properties: ParsedProperty[];
  blocks: ParsedBlock[];
  rendered: string;
  createdTime: number;
  updatedTime: number;
  author: string;
  lastEditor: string;
  hasBody: boolean;
  parentType: "database" | "page" | "block" | "workspace";
  parentId: string;
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

export interface ParsedDatabase {
  id: string;
  url: string;
  title?: string;
  parentType: "database" | "page" | "block" | "workspace";
  parentId: string;
}

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
  skippedDatabaseIds: Set<string> = new Set(),
  retry: { retries: number; backoffFactor: number } = {
    retries: 5,
    backoffFactor: 2,
  }
): Promise<{
  pages: { id: string; lastEditedTs: number }[];
  dbs: { id: string; lastEditedTs: number }[];
  nextCursor: string | null;
}> {
  const localLogger = logger.child(loggerArgs);

  const notionClient = new Client({ auth: notionAccessToken });
  const editedPages: Record<string, number> = {};
  const editedDbs: Record<string, number> = {};
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

        // skip pages that have a `lastEditedTime` in the future
        if (lastEditedTime > Date.now()) {
          localLogger.warn(
            { pageId: pageOrDb.id, lastEditedTime },
            "Page has last edited time in the future."
          );
          continue;
        }

        // We're past sinceTs, we're done, return the list of edited pages and dbs.
        if (sinceTs && lastEditedTime < sinceTs) {
          return {
            pages: Object.entries(editedPages).map(([id, lastEditedTs]) => ({
              id,
              lastEditedTs,
            })),
            dbs: Object.entries(editedDbs).map(([id, lastEditedTs]) => ({
              id,
              lastEditedTs,
            })),
            nextCursor: null,
          };
        }

        // We're still more recent than the sinceTs, add the page to the list of edited pages.
        editedPages[pageOrDb.id] = lastEditedTime;
      }
    } else if (pageOrDb.object === "database") {
      if (skippedDatabaseIds.has(pageOrDb.id)) {
        localLogger.info(
          { databaseId: pageOrDb.id },
          "Skipping database that is marked as skipped."
        );
        continue;
      }
      if (isFullDatabase(pageOrDb)) {
        const lastEditedTime = new Date(pageOrDb.last_edited_time).getTime();

        // skip databases that have a `lastEditedTime` in the future
        if (lastEditedTime > Date.now()) {
          localLogger.warn(
            { pageId: pageOrDb.id, lastEditedTime },
            "Database has last edited time in the future."
          );
          continue;
        }

        // We're past sinceTs, we're done, return the list of edited pages and dbs.
        if (sinceTs && lastEditedTime < sinceTs) {
          return {
            pages: Object.entries(editedPages).map(([id, lastEditedTs]) => ({
              id,
              lastEditedTs,
            })),
            dbs: Object.entries(editedDbs).map(([id, lastEditedTs]) => ({
              id,
              lastEditedTs,
            })),
            nextCursor: null,
          };
        }

        // We're still more recent than the sinceTs, add the db to the list of edited dbs and loop
        // through its pages.
        try {
          editedDbs[pageOrDb.id] = lastEditedTime;

          // Note: we don't want to optimize this step due to Notion not always returning all the
          // dbs (so if we miss it at initial sync and it gets touched we will miss all its old
          // pages here again. It's a lot of additional work but it helps catching as much as we
          // can from Notion). The caller of this function filters the edited page based on our
          // knowledge of it in DB so this won't create extraneous upserts.
          for await (const child of iteratePaginatedAPIWithRetries(
            notionClient.databases.query,
            {
              database_id: pageOrDb.id,
            },
            localLogger.child({ databaseId: pageOrDb.id })
          )) {
            if (isFullPage(child)) {
              editedPages[child.id] = lastEditedTime;
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
    pages: Object.entries(editedPages).map(([id, lastEditedTs]) => ({
      id,
      lastEditedTs,
    })),
    dbs: Object.entries(editedDbs).map(([id, lastEditedTs]) => ({
      id,
      lastEditedTs,
    })),
    nextCursor: resultsPage.has_more ? resultsPage.next_cursor : null,
  };
}

const NOTION_UNAUTHORIZED_ACCESS_ERROR_CODES = [
  "object_not_found",
  "unauthorized",
  "restricted_resource",
];

const NOTION_RETRIABLE_ERRORS = ["rate_limited", "internal_server_error"];

export async function isAccessibleAndUnarchived(
  notionAccessToken: string,
  objectId: string,
  objectType: "page" | "database",
  localLogger?: Logger
): Promise<boolean> {
  const notionClient = new Client({ auth: notionAccessToken });
  const maxTries = 5;
  let tries = 0;

  while (tries < maxTries) {
    const tryLogger = (localLogger || logger).child({
      tries,
      maxTries,
      objectType,
      objectId,
    });

    try {
      tryLogger.info("Checking if page is accessible and unarchived.");
      if (objectType === "page") {
        const page = await notionClient.pages.retrieve({ page_id: objectId });
        if (!isFullPage(page)) {
          return false;
        }
        return !page.archived;
      }
      if (objectType === "database") {
        const db = await notionClient.databases.retrieve({
          database_id: objectId,
        });
        if (!isFullDatabase(db)) {
          return false;
        }
        return !db.archived;
      }
    } catch (e) {
      if (APIResponseError.isAPIResponseError(e)) {
        if (NOTION_RETRIABLE_ERRORS.includes(e.code)) {
          const waitTime = 500 * 2 ** tries;
          tryLogger.info(
            { waitTime },
            "Got potentially transient error. Trying again."
          );
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** tries));
          tries += 1;
          if (tries >= maxTries) {
            throw e;
          }
          continue;
        }
        if (NOTION_UNAUTHORIZED_ACCESS_ERROR_CODES.includes(e.code)) {
          return false;
        }
      }

      tryLogger.error({ error: e }, "Error checking if page is accessible.");
      throw e;
    }
  }

  throw new Error("Unreachable.");
}

export async function getParsedDatabase(
  notionAccessToken: string,
  databaseId: string,
  loggerArgs: Record<string, string | number> = {}
): Promise<ParsedDatabase | null> {
  const localLogger = logger.child({ ...loggerArgs, databaseId });

  const notionClient = new Client({ auth: notionAccessToken });

  let database: GetDatabaseResponse | null = null;

  try {
    localLogger.info("Fetching database from Notion API.");
    database = await notionClient.databases.retrieve({
      database_id: databaseId,
    });
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      localLogger.info("Database not found.");
      return null;
    }
    throw e;
  }

  if (!isFullDatabase(database)) {
    localLogger.info("Database is not a full database.");
    return null;
  }

  const pageLogger = localLogger.child({ databaseUrl: database.url });

  pageLogger.info("Parsing database.");

  const pageParent = database.parent;
  let parentId: string;
  let parentType: string;

  switch (pageParent.type) {
    case "page_id":
      parentId = pageParent.page_id;
      parentType = "page";
      break;
    case "block_id":
      parentId = pageParent.block_id;
      parentType = "block";
      break;
    case "workspace":
      parentId = "workspace";
      parentType = "workspace";
      break;
    default:
      ((pageParent: never) => {
        logger.warn({ pageParent }, "Unknown page parent type.");
      })(pageParent);
      parentId = "unknown";
      parentType = "unknown";
      break;
  }

  const title = database.title.map((t) => t.plain_text).join(" ");

  return {
    id: database.id,
    url: database.url,
    title,
    parentId,
    parentType: parentType as ParsedPage["parentType"],
  };
}

export async function getParsedPage(
  notionAccessToken: string,
  pageId: string,
  loggerArgs: Record<string, string | number> = {}
): Promise<ParsedPage | null> {
  const localLogger = logger.child({ ...loggerArgs, pageId });

  const notionClient = new Client({ auth: notionAccessToken });

  let page: GetPageResponse | null = null;

  try {
    localLogger.info("Fetching page from Notion API.");
    page = await notionClient.pages.retrieve({ page_id: pageId });
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      e.code === "object_not_found"
    ) {
      localLogger.info("Page not found.");
      return null;
    }
    throw e;
  }

  if (!isFullPage(page)) {
    localLogger.info("Page is not a full page.");
    return null;
  }

  const pageLogger = localLogger.child({ pageUrl: page.url });

  pageLogger.info("Parsing page.");
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
      (e.code === "object_not_found" || e.code === "validation_error")
    ) {
      blocks = [];
      pageLogger.info(
        {
          notion_error: {
            code: e.code,
            message: e.message,
          },
        },
        "Couldn't get page blocks."
      );
    } else {
      throw e;
    }
  }

  let parsedBlocks: ParsedBlock[] = [];
  for (const block of blocks) {
    if (isFullBlock(block)) {
      parsedBlocks = parsedBlocks.concat(
        await parsePageBlock(block, notionClient, pageLogger)
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
    (await getUserName(notionClient, page.created_by.id, pageLogger)) ||
    page.created_by.id;
  const lastEditor =
    (await getUserName(notionClient, page.last_edited_by.id, pageLogger)) ||
    page.last_edited_by.id;

  // remove base64 images from rendered page
  renderedPage = renderedPage.replace(/data:image\/[^;]+;base64,[^\n]+/g, "");

  const pageParent = page.parent;
  let parentId: string;
  let parentType: string;

  switch (pageParent.type) {
    case "database_id":
      parentId = pageParent.database_id;
      parentType = "database";
      break;
    case "page_id":
      parentId = pageParent.page_id;
      parentType = "page";
      break;
    case "block_id":
      parentId = pageParent.block_id;
      parentType = "block";
      break;
    case "workspace":
      parentId = "workspace";
      parentType = "workspace";
      break;
    default:
      ((pageParent: never) => {
        logger.warn({ pageParent }, "Unknown page parent type.");
      })(pageParent);
      parentId = "unknown";
      parentType = "unknown";
      break;
  }

  const titleProperty = properties.find((p) => p.type === "title")?.text;

  return {
    id: page.id,
    url: page.url,
    title: titleProperty || undefined,
    properties,
    blocks: parsedBlocks,
    rendered: renderedPage,
    createdTime: new Date(page.created_time).getTime(),
    updatedTime: new Date(page.last_edited_time).getTime(),
    author,
    lastEditor,
    hasBody: pageHasBody,
    parentId,
    parentType: parentType as ParsedPage["parentType"],
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
  notionClient: Client,
  pageLogger: Logger
): Promise<string | null> {
  const rows: string[] = [];
  let header: string[] | null = null;
  try {
    for await (const page of iteratePaginatedAPIWithRetries(
      notionClient.databases.query,
      {
        database_id: block.id,
      },
      pageLogger.child({ databaseId: block.id, blockType: block.type })
    )) {
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
      pageLogger.info(
        { database_id: block.id },
        "Couln't query child database."
      );
      return null;
    }
    throw e;
  }
}

async function getUserName(
  notionClient: Client,
  userId: string,
  pageLogger: Logger
): Promise<string | null> {
  const nameFromCache = await cacheGet(`notion-user-name:${userId}`);
  if (nameFromCache) {
    pageLogger.info({ user_id: userId }, "Got user name from cache.");
    return nameFromCache;
  }

  try {
    pageLogger.info({ user_id: userId }, "Fetching user name from Notion API.");
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
      (e.code === "object_not_found" || e.code === "validation_error")
    ) {
      pageLogger.info({ user_id: userId }, "Couln't find user.");
      return null;
    }
    throw e;
  }
}

async function parsePageBlock(
  block: BlockObjectResponse,
  notionClient: Client,
  pageLogger: Logger,
  parentsIds: Set<string> = new Set()
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

    const parsedChildren: ParsedBlock[] = [];
    try {
      for await (const child of iteratePaginatedAPIWithRetries(
        notionClient.blocks.children.list,
        {
          block_id: block.id,
        },
        pageLogger.child({ blockId: block.id, blockType: block.type })
      )) {
        if (isFullBlock(child)) {
          if (!parentsIds.has(child.id)) {
            parsedChildren.push(
              ...(await parsePageBlock(
                child,
                notionClient,
                pageLogger,
                new Set([...parentsIds, block.id])
              ))
            );
          }
        }
      }
    } catch (e) {
      if (
        APIResponseError.isAPIResponseError(e) &&
        e.code === "object_not_found"
      ) {
        pageLogger.info({ blockId: block.id }, "Couln't get block's children.");
        return parsedBlocks;
      }
      throw e;
    }

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
          text: await renderChildDatabase(block, notionClient, pageLogger),
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

interface IPaginatedList<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export async function* iteratePaginatedAPIWithRetries<
  Args extends {
    start_cursor?: string;
  },
  Item
>(
  listFn: (args: Args) => Promise<IPaginatedList<Item>>,
  firstPageArgs: Args,
  localLogger?: Logger | null,
  retry: { retries: number; backoffFactor: number } = {
    retries: 5,
    backoffFactor: 2,
  }
): AsyncIterableIterator<Item> {
  let nextCursor: string | null | undefined = firstPageArgs.start_cursor;
  let resultPageIdx = 0;
  do {
    let tries = 0;
    let response: IPaginatedList<Item> | null = null;
    const resultPageLogger = (localLogger || logger).child({
      firstPageArgs,
      resultPageIdx,
      nextCursor,
    });
    while (tries < retry.retries) {
      const tryLogger = resultPageLogger.child({
        tries,
        maxTries: retry.retries,
      });
      try {
        tryLogger.info("Fetching result page from Notion paginated API.");
        response = await listFn({
          ...firstPageArgs,
          start_cursor: nextCursor,
        });
        break;
      } catch (e) {
        if (
          APIResponseError.isAPIResponseError(e) &&
          e.code === "object_not_found"
        ) {
          throw e;
        }
        tryLogger.error(
          { error: e },
          "Error while iterating on Notion paginated API."
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
    }

    if (!response) {
      throw new Error("Unreachable.");
    }

    yield* response.results;
    nextCursor = response.next_cursor;
    resultPageIdx += 1;
  } while (nextCursor);
}
