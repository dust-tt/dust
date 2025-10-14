import type { Result } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import type {
  BlockObjectRequest,
  CreateCommentParameters,
  QueryDatabaseParameters,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { APIResponseError } from "@notionhq/client/build/src/errors";
import { parseISO } from "date-fns";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  SearchQueryResourceType,
  SearchResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { renderRelativeTimeFrameForToolOutput } from "@app/lib/actions/mcp_internal_actions/rendering";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { NOTION_SEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import type { TimeFrame } from "@app/types";
import {
  Err,
  normalizeError,
  Ok,
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parentPageSchema = z
  .object({
    type: z.literal("page_id").describe("Must be 'page_id' for a page parent."),
    page_id: z.string().regex(uuidRegex).describe("The ID of the parent page."),
  })
  .strict();

const allowedColors = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
  "default_background",
  "gray_background",
  "brown_background",
  "orange_background",
  "yellow_background",
  "green_background",
  "blue_background",
  "purple_background",
  "pink_background",
  "red_background",
] as const;

// We use a single tool name for monitoring given the high granularity (can be revisited).
const NOTION_TOOL_NAME = "notion";

const titleRichTextSchema = z
  .object({
    type: z.literal("text"),
    text: z.object({
      content: z.string(),
      link: z.object({ url: z.string() }).nullable().optional(),
    }),
    annotations: z
      .object({
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        strikethrough: z.boolean().optional(),
        underline: z.boolean().optional(),
        code: z.boolean().optional(),
        color: z.enum(allowedColors).optional(),
      })
      .optional(),
    plain_text: z.string().optional(),
    href: z.string().nullable().optional(),
  })
  .strict();

const propertiesSchema = z
  .record(z.string(), z.any())
  .default({})
  .describe(
    "Properties for the new page or database. Keys are property names, values are property value objects as per Notion API. See https://developers.notion.com/reference/page#property-value-types for details."
  );

const dbFilterSchema = z
  .object({})
  .passthrough()
  .describe(
    "Filter object as per Notion API. Must match the Notion API filter structure. See https://developers.notion.com/reference/post-database-query-filter"
  );
const dbSortSchema = z
  .object({
    property: z.string(),
    direction: z.enum(["ascending", "descending"]),
  })
  .strict()
  .describe(
    "Sort object as per Notion API. See https://developers.notion.com/reference/post-database-query-sort"
  );
const dbSortsArraySchema = z
  .array(dbSortSchema)
  .describe("Array of sort objects as per Notion API.");

const RichTextSchema = z
  .object({
    type: z.string(),
    text: z
      .object({
        content: z.string(),
        link: z.object({ url: z.string() }).nullable().optional(),
      })
      .optional(),
    plain_text: z.string().optional(),
    href: z.string().nullable().optional(),
  })
  .passthrough();

const ParagraphBlock = z.object({
  type: z.literal("paragraph"),
  paragraph: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const Heading1Block = z.object({
  type: z.literal("heading_1"),
  heading_1: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
    is_toggleable: z.boolean().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const Heading2Block = z.object({
  type: z.literal("heading_2"),
  heading_2: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
    is_toggleable: z.boolean().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const Heading3Block = z.object({
  type: z.literal("heading_3"),
  heading_3: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
    is_toggleable: z.boolean().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const BulletedListItemBlock = z.object({
  type: z.literal("bulleted_list_item"),
  bulleted_list_item: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const NumberedListItemBlock = z.object({
  type: z.literal("numbered_list_item"),
  numbered_list_item: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const ToDoBlock = z.object({
  type: z.literal("to_do"),
  to_do: z.object({
    rich_text: z.array(RichTextSchema),
    checked: z.boolean().optional(),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const ToggleBlock = z.object({
  type: z.literal("toggle"),
  toggle: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const QuoteBlock = z.object({
  type: z.literal("quote"),
  quote: z.object({
    rich_text: z.array(RichTextSchema),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const CalloutBlock = z.object({
  type: z.literal("callout"),
  callout: z.object({
    rich_text: z.array(RichTextSchema),
    icon: z.any().optional(),
    color: z.string().optional(),
  }),
  children: z.lazy(() => NotionBlockSchema.array()).optional(),
});

const FallbackBlock = z
  .object({
    type: z.string(),
  })
  .passthrough();

export const NotionBlockSchema: z.ZodType = z.union([
  ParagraphBlock,
  Heading1Block,
  Heading2Block,
  Heading3Block,
  BulletedListItemBlock,
  NumberedListItemBlock,
  ToDoBlock,
  ToggleBlock,
  QuoteBlock,
  CalloutBlock,
  FallbackBlock,
]);

function makeQueryResource(
  query: string,
  type: "page" | "database",
  relativeTimeFrame: TimeFrame | null
): SearchQueryResourceType {
  const timeFrameAsString =
    renderRelativeTimeFrameForToolOutput(relativeTimeFrame);

  const text = `Searching Notion ${type}s ${timeFrameAsString} containing: ${query}`;
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_QUERY,
    text,
    uri: "",
  };
}

async function withNotionClient<T>(
  fn: (notion: Client) => Promise<T>,
  authInfo?: AuthInfo
): Promise<Result<CallToolResult["content"], MCPError>> {
  try {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Ok(makePersonalAuthenticationError("notion").content);
    }
    const notion = new Client({ auth: accessToken });

    const result = await fn(notion);
    return new Ok(
      makeMCPToolJSONSuccess({
        message: "Success",
        result: JSON.stringify(result),
      }).content
    );
  } catch (e) {
    const tracked =
      APIResponseError.isAPIResponseError(e) &&
      [
        // Ignoring errors due to a malformed input passed by the model (e.g. invalid ID).
        "restricted_resource",
        "object_not_found",
        "invalid_request",
        "validation_error",
      ].includes(e.code);
    return new Err(
      new MCPError(normalizeError(e).message, {
        tracked,
        cause: normalizeError(e),
      })
    );
  }
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("notion");

  server.tool(
    "search",
    "Search for pages or databases in Notion.",
    {
      query: z.string().describe("Search query string."),
      relativeTimeFrame: z
        .string()
        .regex(/^(all|\d+[hdwmy])$/)
        .describe(
          "The time frame (relative to LOCAL_TIME) to restrict the search based" +
            " on the user request and past conversation context." +
            " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
            " where {k} is a number. Be strict, do not invent invalid values."
        ),
      type: z
        .enum(["page", "database"])
        .describe("What type of notion objects to search."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ query, type, relativeTimeFrame }, { authInfo }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("Agent loop run context is required"));
        }

        const accessToken = authInfo?.token;
        if (!accessToken) {
          return new Ok(makePersonalAuthenticationError("notion").content);
        }
        const notion = new Client({ auth: accessToken });

        const rawResults = await notion.search({
          query,
          filter: {
            property: "object",
            value: type,
          },
          page_size: NOTION_SEARCH_ACTION_NUM_RESULTS,
        });

        const timeFrame = parseTimeFrame(relativeTimeFrame);
        const queryResource = makeQueryResource(query, type, timeFrame);

        let results = rawResults.results;

        // Notion search does not support time frame filtering, so we need to filter the results after the search.
        if (timeFrame) {
          const timestampInMs = timeFrameFromNow(timeFrame);
          const date = new Date(timestampInMs);
          results = rawResults.results.filter((result) => {
            if (isFullPage(result) || isFullDatabase(result)) {
              const lastEditedTime = parseISO(result.last_edited_time);
              return lastEditedTime > date;
            }
            return true;
          });
        }

        if (results.length === 0) {
          return new Ok([
            {
              type: "resource" as const,
              resource: queryResource,
            },
            {
              type: "text" as const,
              text: "No results found.",
            },
          ]);
        } else {
          const { citationsOffset } = agentLoopContext.runContext.stepContext;

          const refs = getRefs().slice(
            citationsOffset,
            citationsOffset + NOTION_SEARCH_ACTION_NUM_RESULTS
          );

          const resultResources = results.map((result) => {
            if (isFullPage(result)) {
              const title =
                (
                  Object.values(result.properties).find(
                    (p) => p.type === "title"
                  ) as { title: RichTextItemResponse[] }
                )?.title[0]?.plain_text ?? "Untitled Page";

              const description = Object.entries(result.properties)
                .filter(
                  ([, value]) =>
                    value.type === "rich_text" && value.rich_text.length > 0
                )
                .map(([name, value]): [string, RichTextItemResponse[]] => [
                  name,
                  value.type === "rich_text" ? value.rich_text : [],
                ])
                .map(([name, richText]): string => {
                  return `${name}: ${richText
                    .filter((t) => !!t?.plain_text)
                    .map((t) => t?.plain_text)
                    .join(" ")}`;
                })
                .join("\n");

              return {
                mimeType:
                  INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
                uri: result.url,
                text: title,
                id: result.id,
                tags: [
                  `created: ${result.created_time}`,
                  `lastEdited: ${result.last_edited_time}`,
                ],
                ref: refs.shift() as string,
                chunks: description ? [description] : [],
                source: {
                  provider: "notion",
                },
              } satisfies SearchResultResourceType;
            } else if (isFullDatabase(result)) {
              const title = result.title[0]?.plain_text ?? "Untitled Database";
              const description = result.description
                ?.map((d) => d?.plain_text)
                .join(" ");

              return {
                mimeType:
                  INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
                uri: result.url,
                text: title,
                id: result.id,
                tags: [
                  `created: ${result.created_time}`,
                  `lastEdited: ${result.last_edited_time}`,
                ],
                ref: refs.shift() as string,
                chunks: description ? [description] : [],
                source: {
                  provider: "notion",
                },
              } satisfies SearchResultResourceType;
            } else {
              return JSON.stringify(result.object);
            }
          });

          return new Ok([
            {
              type: "resource" as const,
              resource: queryResource,
            },
            ...resultResources.map((result) =>
              typeof result === "string"
                ? {
                    type: "text" as const,
                    text: result,
                  }
                : {
                    type: "resource" as const,
                    resource: result,
                  }
            ),
          ]);
        }
      }
    )
  );

  server.tool(
    "retrieve_page",
    "Retrieve a Notion page by its ID.",
    {
      pageId: z.string().describe("The Notion page ID."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ pageId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.pages.retrieve({ page_id: pageId }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "retrieve_database_schema",
    "Retrieve a Notion database's schema by its ID.",
    {
      databaseId: z.string().describe("The Notion database ID."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ databaseId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.databases.retrieve({ database_id: databaseId }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "retrieve_database_content",
    "Retrieve the content (pages) of a Notion database by its ID.",
    {
      databaseId: z.string().describe("The Notion database ID."),
      filter: dbFilterSchema.optional(),
      sorts: dbSortsArraySchema.optional(),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async (
        { databaseId, filter, sorts, start_cursor, page_size },
        { authInfo }
      ) => {
        return withNotionClient(
          (notion) =>
            notion.databases.query({
              database_id: databaseId,
              filter: filter as QueryDatabaseParameters["filter"],
              sorts,
              start_cursor,
              page_size,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "query_database",
    "Query a Notion database.",
    {
      databaseId: z.string().describe("The Notion database ID."),
      filter: dbFilterSchema.optional(),
      sorts: dbSortsArraySchema.optional(),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async (
        { databaseId, filter, sorts, start_cursor, page_size },
        { authInfo }
      ) => {
        return withNotionClient(
          (notion) =>
            notion.databases.query({
              database_id: databaseId,
              filter: filter as QueryDatabaseParameters["filter"],
              sorts,
              start_cursor,
              page_size,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "create_page",
    "Create a new Notion page.",
    {
      parent: parentPageSchema.describe(
        "The existing parent page where the new page is inserted. Must be an existing page ID. Use the search action to find a page ID."
      ),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ parent, properties, icon, cover }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.pages.create({ parent, properties, icon, cover }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "insert_row_into_database",
    "Create a new Notion page in a database.",
    {
      databaseId: z.string().describe("The Notion database ID."),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ databaseId, properties, icon, cover }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.pages.create({
              parent: { database_id: databaseId, type: "database_id" },
              properties,
              icon,
              cover,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "create_database",
    "Create a new Notion database (table).",
    {
      parent: parentPageSchema.describe(
        "The existing parent where the new database is inserted. Must be an existing page ID. Use the search action to find a page ID."
      ),
      title: z
        .array(titleRichTextSchema)
        .describe(
          "Title for the database as an array of rich text objects (see Notion API). Each item must have type: 'text' and a text object with content."
        ),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ parent, title, properties, icon, cover }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.databases.create({ parent, title, properties, icon, cover }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "update_page",
    "Update a Notion page's properties.",
    {
      pageId: z.string().describe("The Notion page ID."),
      properties: propertiesSchema,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ pageId, properties }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.pages.update({ page_id: pageId, properties }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "retrieve_block",
    "Retrieve a Notion block by its ID.",
    {
      blockId: z.string().describe("The Notion block ID."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ blockId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.blocks.retrieve({ block_id: blockId }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "retrieve_block_children",
    "Retrieve the children of a Notion block or page by its ID.",
    {
      blockId: z.string().describe("The Notion block or page ID."),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ blockId, start_cursor, page_size }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.blocks.children.list({
              block_id: blockId,
              start_cursor,
              page_size,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "add_page_content",
    "Add a single content block to a Notion page. For multiple blocks, call this action multiple times. Only supports adding to Notion pages. Blocks that can contain children include: page, toggle, to-do, bulleted list, numbered list, callout, and quote.",
    {
      blockId: z.string().describe("The ID of the parent block or page."),
      children: z
        .array(NotionBlockSchema)
        .describe(
          "Array of block objects to append as children. Blocks can be parented by other blocks, pages, or databases. There is a limit of 100 block children that can be appended by a single API request."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ blockId, children }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.blocks.children.append({
              block_id: blockId,
              children: children as Array<BlockObjectRequest>,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "create_comment",
    "Create a comment on a Notion page or in an existing discussion thread. Provide either a parent page ID or a discussion ID. Inline comments to start a new thread are not supported via the public API.",
    {
      parent_page_id: z
        .string()
        .regex(uuidRegex)
        .optional()
        .describe(
          "The ID of the parent page (optional, required if not using discussion_id)."
        ),
      discussion_id: z
        .string()
        .optional()
        .describe(
          "The ID of the discussion thread (optional, required if not using parent_page_id)."
        ),
      comment: z.string().describe("The comment text."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ parent_page_id, discussion_id, comment }, { authInfo }) => {
        return withNotionClient((notion) => {
          if (!parent_page_id && !discussion_id) {
            throw new Error(
              "Either parent_page_id or discussion_id must be provided."
            );
          }
          let params: CreateCommentParameters;
          if (parent_page_id) {
            params = {
              parent: { page_id: parent_page_id },
              rich_text: [{ type: "text", text: { content: comment } }],
            };
          } else {
            params = {
              discussion_id: discussion_id!,
              rich_text: [{ type: "text", text: { content: comment } }],
            };
          }
          return notion.comments.create(params);
        }, authInfo);
      }
    )
  );

  server.tool(
    "delete_block",
    "Archive (delete) a block, page, or database in Notion by setting it to archived: true. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    {
      blockId: z
        .string()
        .describe("The ID of the block, page, or database to delete."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ blockId }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.blocks.update({ block_id: blockId, archived: true }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "fetch_comments",
    "Retrieve a list of unresolved comment objects from a specified page or block in Notion.",
    {
      blockId: z
        .string()
        .describe("The ID of the page or block to fetch comments from."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ blockId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.comments.list({ block_id: blockId }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "update_row_database",
    "Update a specific property value in a row (page) of a Notion database. Value formats depend on the property type (e.g., text, number, select, date, people, URL, files, checkbox).",
    {
      pageId: z.string().regex(uuidRegex).describe("The Notion page ID."),
      properties: propertiesSchema,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ pageId, properties }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.pages.update({ page_id: pageId, properties }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "update_schema_database",
    "Update the schema (columns/properties) of an existing Notion database.",
    {
      databaseId: z.string().describe("The Notion database ID."),
      properties: propertiesSchema,
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ databaseId, properties }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.databases.update({ database_id: databaseId, properties }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "list_users",
    "List all users in the Notion workspace.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async (_, { authInfo }) => {
        return withNotionClient((notion) => notion.users.list({}), authInfo);
      }
    )
  );

  server.tool(
    "get_about_user",
    "Get information about a specific user by userId.",
    {
      userId: z.string().describe("The Notion user ID."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        skipAlerting: true,
      },
      async ({ userId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.users.retrieve({ user_id: userId }),
          authInfo
        );
      }
    )
  );

  return server;
};

export default createServer;
