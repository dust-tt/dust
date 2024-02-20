import { cacheWithRedis } from "@dust-tt/types";
import type { LogLevel } from "@notionhq/client";
import {
  APIResponseError,
  Client,
  isFullBlock,
  isFullDatabase,
  isFullPage,
} from "@notionhq/client";
import type {
  BlockObjectResponse,
  GetDatabaseResponse,
  GetPageResponse,
  ListBlockChildrenResponse,
  PageObjectResponse,
  RichTextItemResponse,
  SearchResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { stringify } from "csv-stringify";
import type { Logger } from "pino";

import type {
  PageObjectProperties,
  ParsedNotionBlock,
  ParsedNotionDatabase,
  ParsedNotionPage,
  PropertyKeys,
} from "@connectors/connectors/notion/lib/types";
import { cacheGet, cacheSet } from "@connectors/lib/cache";
import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({ provider: "notion" });

const notionClientLogger = (
  level: LogLevel,
  message: string,
  extraInfo: Record<string, unknown>
) => {
  logger.info(`[Log from Notion Client] Level ${level}: ${message}`, extraInfo);
};

/**
 * @param notionAccessToken the access token to use to access the Notion API
 * @param sinceTs a millisecond timestamp representing the minimum last edited time of
 * pages to return. If null, all pages will be returned.
 * @param cursor a cursor to use to fetch the next page of results. If null, the first
 * page of results will be returned.
 * @param loggerArgs arguments to pass to the logger
 * @param retry options for retrying the request
 * @returns a promise that resolves to an array of page IDs, an array of database IDs and the next
 * cursor
 */
export async function getPagesAndDatabasesEditedSince(
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

  const notionClient = new Client({
    auth: notionAccessToken,
    logger: notionClientLogger,
  });
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
  const notionClient = new Client({
    auth: notionAccessToken,
    logger: notionClientLogger,
  });
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
        if (
          NOTION_UNAUTHORIZED_ACCESS_ERROR_CODES.includes(e.code) ||
          // This happens if the database is a "linked" database - we can't query those so
          // it's not useful to retry. We just assume that we don't have access to this resource
          // and return false.
          e.code === "validation_error"
        ) {
          return false;
        }
      }

      tryLogger.error({ error: e }, "Error checking if page is accessible.");
      throw e;
    }
  }

  throw new Error("Unreachable.");
}

async function getBlockParent(
  notionAccessToken: string,
  blockId: string,
  localLogger: Logger
): Promise<{
  parentId: string;
  parentType: "database" | "page" | "workspace";
} | null> {
  // we attempt to go up the tree of blocks until we find a page or a database (or the workspace)
  // - after 8 levels of block parents, we give up and return null
  // - if we encounter a block that is not a full block, or we get a non-retriable error, we give up and return null
  // - if we get 5 transient errors in a row, we throw an error (we let the tempooral activity manage the retries)
  const max_depth = 8;
  const max_transient_errors = 5;

  const notionClient = new Client({
    auth: notionAccessToken,
    logger: notionClientLogger,
  });
  let depth = 0;
  let transient_errors = 0;

  for (;;) {
    localLogger.info({ blockId }, "Looking up block parent");
    try {
      const block = await notionClient.blocks.retrieve({
        block_id: blockId,
      });

      if (!isFullBlock(block)) {
        // Not much we can do here to get the parent page.
        return null;
      }

      const parent = getPageOrBlockParent(block);
      if (parent.type === "unknown") {
        localLogger.warn("Unknown block parent type.");
        return null;
      } else if (parent.type !== "block") {
        return {
          parentId: parent.id,
          parentType: parent.type,
        };
      }

      blockId = parent.id;

      depth += 1;
      if (depth === max_depth) {
        // We don't want to go up more than 8 levels.
        return null;
      }
    } catch (e) {
      if (!NOTION_RETRIABLE_ERRORS.includes((e as { code: string }).code)) {
        return null;
      }

      const waitTime = 500 * 2 ** transient_errors;
      transient_errors += 1;
      if (transient_errors === max_transient_errors) {
        // We don't want to retry more than 5 times.
        throw e;
      }
      localLogger.info(
        { waitTime },
        "Got potentially transient error. Trying again."
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }
  }
}

export const getBlockParentMemoized = cacheWithRedis(
  getBlockParent,
  (notionAccessToken: string, blockId: string) => {
    return blockId;
  },
  60 * 10 * 1000
);

export async function getParsedDatabase(
  notionAccessToken: string,
  databaseId: string,
  loggerArgs: Record<string, string | number> = {}
): Promise<ParsedNotionDatabase | null> {
  const localLogger = logger.child({ ...loggerArgs, databaseId });

  const notionClient = new Client({
    auth: notionAccessToken,
    logger: notionClientLogger,
  });

  let database: GetDatabaseResponse | null = null;

  try {
    localLogger.info("Fetching database from Notion API.");
    database = await notionClient.databases.retrieve({
      database_id: databaseId,
    });
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      (NOTION_UNAUTHORIZED_ACCESS_ERROR_CODES.includes(e.code) ||
        // This happens if the database is a "linked" database - we can't query those so
        // it's not useful to retry.
        e.code === "validation_error")
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

  const dbLogger = localLogger.child({ databaseUrl: database.url });

  dbLogger.info("Parsing database.");

  const dbParent = database.parent;
  let parentId: string;
  let parentType: string;

  switch (dbParent.type) {
    case "page_id":
      parentId = dbParent.page_id;
      parentType = "page";
      break;
    case "block_id": {
      const parent = await getBlockParentMemoized(
        notionAccessToken,
        dbParent.block_id,
        dbLogger
      );
      if (parent) {
        parentId = parent.parentId;
        parentType = parent.parentType;
      } else {
        parentId = dbParent.block_id;
        parentType = "block";
      }
      break;
    }
    case "workspace":
      parentId = "workspace";
      parentType = "workspace";
      break;
    default:
      ((dbParent: never) => {
        logger.warn({ dbParent }, "Unknown page parent type.");
      })(dbParent);
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
    parentType: parentType as ParsedNotionPage["parentType"],
  };
}

export async function retrievePage({
  accessToken,
  pageId,
  loggerArgs,
}: {
  accessToken: string;
  pageId: string;
  loggerArgs: Record<string, string | number>;
}): Promise<PageObjectResponse | null> {
  const localLogger = logger.child({ ...loggerArgs, pageId });

  const notionClient = new Client({
    auth: accessToken,
    logger: notionClientLogger,
  });

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

  return page;
}

export function parsePageProperties(pageProperties: PageObjectProperties) {
  const properties = Object.entries(pageProperties).map(([key, value]) => ({
    key,
    id: value.id,
    type: value.type,
    text: parsePropertyText(value),
  }));

  return properties;
}

export async function retrieveBlockChildrenResultPage({
  accessToken,
  blockOrPageId,
  cursor,
  loggerArgs,
}: {
  accessToken: string;
  blockOrPageId: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
}): Promise<ListBlockChildrenResponse | null> {
  const localLogger = logger.child(loggerArgs);

  const notionClient = new Client({
    auth: accessToken,
    logger: notionClientLogger,
  });

  try {
    localLogger.info(
      "Fetching block or page children result page from Notion API."
    );
    const resultPage = await notionClient.blocks.children.list({
      block_id: blockOrPageId,
      start_cursor: cursor ?? undefined,
    });
    localLogger.info(
      { count: resultPage.results.length },
      "Received block or page children result page from Notion API."
    );
    return resultPage;
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      (e.code === "object_not_found" || e.code === "validation_error")
    ) {
      localLogger.info(
        {
          notion_error: {
            code: e.code,
            message: e.message,
          },
        },
        "Couldn't get block or page children."
      );
      return null;
    } else {
      throw e;
    }
  }
}

export function getPageOrBlockParent(
  pageOrBlock: PageObjectResponse | BlockObjectResponse
):
  | {
      type: "database" | "page" | "block";
      id: string;
    }
  | {
      type: "workspace";
      id: "workspace";
    }
  | {
      type: "unknown";
      id: "unknown";
    } {
  const type = pageOrBlock.parent.type;
  switch (type) {
    case "database_id":
      return {
        type: "database",
        id: pageOrBlock.parent.database_id,
      };
    case "page_id":
      return {
        type: "page",
        id: pageOrBlock.parent.page_id,
      };
    case "block_id":
      return {
        type: "block",
        id: pageOrBlock.parent.block_id,
      };
    case "workspace":
      return {
        type: "workspace",
        id: "workspace",
      };
    default:
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ((_x: never) => {
        //
      })(type);
      return {
        type: "unknown",
        id: "unknown",
      };
  }
}

export async function validateAccessToken(notionAccessToken: string) {
  const notionClient = new Client({
    auth: notionAccessToken,
    logger: notionClientLogger,
  });
  try {
    await notionClient.search({ page_size: 1 });
  } catch (e) {
    return false;
  }
  return true;
}

export function parsePropertyText(
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
      return property.title && property.title.map
        ? property.title.map((t) => t.plain_text).join(" ")
        : null;
    case "rich_text":
      return property.rich_text && property.rich_text.map
        ? property.rich_text.map((t) => t.plain_text).join(" ")
        : null;
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

export async function retrieveDatabaseChildrenResultPage({
  accessToken,
  databaseId,
  cursor,
  loggerArgs,
}: {
  accessToken: string;
  databaseId: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
}) {
  const localLogger = logger.child({ ...loggerArgs, databaseId });

  const notionClient = new Client({
    auth: accessToken,
    logger: notionClientLogger,
  });

  localLogger.info("Fetching database children result page from Notion API.");
  try {
    const resultPage = await notionClient.databases.query({
      database_id: databaseId,
      start_cursor: cursor || undefined,
    });

    localLogger.info(
      { count: resultPage.results.length },
      "Received database children result page from Notion API."
    );

    return resultPage;
  } catch (e) {
    if (
      APIResponseError.isAPIResponseError(e) &&
      (NOTION_UNAUTHORIZED_ACCESS_ERROR_CODES.includes(e.code) ||
        e.code === "validation_error")
    ) {
      localLogger.info(
        {
          notion_error: {
            code: e.code,
            message: e.message,
          },
        },
        "Couldn't get database children."
      );
      return null;
    } else {
      throw e;
    }
  }
}

// This function is used to create a text representation of a notion database properties.
// We use it to render databases inline (in the Notion Page document on Dust), and to create
// structured Tables on Dust (we use the CSV format).
// The function accepts a `dustIdColumn` array which must have the same length as the `pagesProperties`. This
// array is used to add a column to the CSV that contains the Dust ID of the page (__dust_id). This is useful
// to uniquely identify the notion page in the CSV.
export async function renderDatabaseFromPages({
  databaseTitle,
  pagesProperties,
  dustIdColumn,
  rowBoundary = "||",
  cellSeparator = " | ",
}: {
  databaseTitle: string | null;
  pagesProperties: PageObjectProperties[];
  dustIdColumn?: string[];
  rowBoundary?: string;
  cellSeparator?: string;
}) {
  if (!pagesProperties.length || !pagesProperties[0]) {
    return "";
  }

  if (dustIdColumn && dustIdColumn.length !== pagesProperties.length) {
    throw new Error(
      "The dustIdColumn should have the same length as the pagesProperties."
    );
  }

  let header = Object.entries(pagesProperties[0])
    .map(([key]) => key)
    // We remove empty keys.
    .filter((k) => !!k.trim());

  if (dustIdColumn) {
    header = ["__dust_id", ...header];
  }
  const rows = pagesProperties.map((pageProperties, pageIndex) =>
    header.map((k) => {
      if (k === "__dust_id" && dustIdColumn) {
        return dustIdColumn[pageIndex];
      }
      const property = pageProperties[k];
      if (!property) {
        return "";
      }
      return parsePropertyText(property);
    })
  );

  const content = rows.map((r) =>
    header.reduce(
      (acc, k, i) => ({ ...acc, [k]: r[i]?.trim() ?? "" }),
      {} as Record<string, string>
    )
  );

  let csv = await new Promise<string>((resolve, reject) => {
    stringify(
      content,
      { header: true, delimiter: cellSeparator },
      (err, output) => {
        if (err) {
          reject(err);
        } else {
          resolve(output);
        }
      }
    );
  });

  if (rowBoundary) {
    csv = csv
      .split("\n")
      .filter((row) => row.length)
      .map((row) => `${rowBoundary}${row}${rowBoundary}`)
      .join("\n");
  }

  if (databaseTitle) {
    csv = `${databaseTitle}\n${csv}`;
  }

  return csv;
}

export async function getUserName(
  accessToken: string,
  userId: string,
  pageLogger: Logger
): Promise<string | null> {
  const nameFromCache = await cacheGet(`notion-user-name:${userId}`);
  if (nameFromCache) {
    pageLogger.info({ user_id: userId }, "Got user name from cache.");
    return nameFromCache;
  }

  const notionClient = new Client({
    auth: accessToken,
    logger: notionClientLogger,
  });

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

export function parsePageBlock(block: BlockObjectResponse): ParsedNotionBlock {
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
        : fileContainer.file?.url || "NO_URL";
    const caption = parseRichText(fileContainer.caption);
    const fileText =
      caption && caption.length
        ? `[${parseRichText(fileContainer.caption)}](${fileUrl})`
        : fileUrl;
    return fileText;
  }

  const commonFields = {
    id: block.id,
    type: block.type,
    hasChildren: false,
    childDatabaseTitle: null,
  };

  const NULL_BLOCK = {
    ...commonFields,
    text: null,
  };

  switch (block.type) {
    case "breadcrumb":
    case "link_to_page":
    case "divider":
    case "table_of_contents":
    case "unsupported":
      // TODO: check if we want that ?
      return NULL_BLOCK;

    case "equation":
      return {
        ...commonFields,
        text: block.equation.expression,
      };

    case "link_preview":
      return {
        ...commonFields,
        text: block.link_preview.url,
      };

    case "table_row":
      return {
        ...commonFields,
        text: `||${block.table_row.cells.map(parseRichText).join(" | ")}||`,
      };

    case "code":
      return {
        ...commonFields,
        text: `\`\`\`${block.code.language} ${parseRichText(
          block.code.rich_text
        )} \`\`\``,
      };

    // child databases are a special case
    // we need to fetch all the pages in the database to reconstruct the table
    // this is handled by the caller
    case "child_database":
      return {
        ...commonFields,
        text: null,
        childDatabaseTitle: block.child_database.title,
      };

    // URL blocks
    case "bookmark":
      return {
        ...commonFields,
        text: block.bookmark
          ? renderUrl(block.bookmark.url, parseRichText(block.bookmark.caption))
          : null,
      };

    case "embed":
      return {
        ...commonFields,
        text: renderUrl(block.embed.url, parseRichText(block.embed.caption)),
      };

    // File blocks
    case "file":
      return {
        ...commonFields,
        text: renderFile(block.file),
      };

    case "image":
      return {
        ...commonFields,
        text: renderFile(block.image),
      };

    case "pdf":
      return {
        ...commonFields,
        text: renderFile(block.pdf),
      };

    case "video":
      return {
        ...commonFields,
        text: renderFile(block.video),
      };

    case "audio":
      return {
        ...commonFields,
        text: renderFile(block.audio),
      };

    // blocks that may have child blocks:
    case "table":
      return { ...NULL_BLOCK, hasChildren: block.has_children };

    case "bulleted_list_item":
      return {
        ...commonFields,
        text: `* ${parseRichText(block.bulleted_list_item.rich_text)}`,
        hasChildren: block.has_children,
      };

    case "callout":
      return {
        ...commonFields,
        text: parseRichText(block.callout.rich_text),
        hasChildren: block.has_children,
      };
    case "heading_1":
      return {
        ...commonFields,
        text: `# ${parseRichText(block.heading_1.rich_text).replace(
          "\n",
          " "
        )}`,
        hasChildren: block.has_children,
      };

    case "heading_2":
      return {
        ...commonFields,
        text: `## ${parseRichText(block.heading_2.rich_text).replace(
          "\n",
          " "
        )}`,
        hasChildren: block.has_children,
      };

    case "heading_3":
      return {
        ...commonFields,
        text: `### ${parseRichText(block.heading_3.rich_text).replace(
          "\n",
          " "
        )}`,
        hasChildren: block.has_children,
      };

    case "numbered_list_item":
      return {
        ...commonFields,
        text: parseRichText(block.numbered_list_item.rich_text),
        hasChildren: block.has_children,
      };

    case "paragraph":
      return {
        ...commonFields,
        text: parseRichText(block.paragraph.rich_text),
        hasChildren: block.has_children,
      };

    case "quote":
      return {
        ...commonFields,
        text: `> ${parseRichText(block.quote.rich_text)}`,
        hasChildren: block.has_children,
      };

    case "template":
      return {
        ...commonFields,
        text: parseRichText(block.template.rich_text),
        hasChildren: block.has_children,
      };

    case "to_do":
      return {
        ...commonFields,
        text: `[${block.to_do.checked ? "x" : " "}] ${parseRichText(
          block.to_do.rich_text
        )}`,
        hasChildren: block.has_children,
      };

    case "toggle":
      return {
        ...commonFields,
        text: parseRichText(block.toggle.rich_text),
        hasChildren: block.has_children,
      };

    case "column_list":
    case "column":
    case "synced_block":
      return { ...NULL_BLOCK, hasChildren: block.has_children };
    // blocks that technically have children but we don't want to recursively parse them
    // because the search endpoint returns them already
    case "child_page":
      return {
        ...commonFields,
        text: block.child_page.title,
      };

    default:
      // `block` here is `never`
      ((block: never) => {
        logger.warn(
          { type: (block as { type: string }).type },
          "Unknown block type."
        );
      })(block);
      return NULL_BLOCK;
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
