import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Exports for monitoring
// =============================================================================

export const NOTION_TOOL_NAME = "notion" as const;

// =============================================================================
// Shared Schemas - Used by multiple tools
// =============================================================================

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const parentPageSchema = z
  .object({
    type: z.literal("page_id").describe("Must be 'page_id' for a page parent."),
    page_id: z.string().regex(uuidRegex).describe("The ID of the parent page."),
  })
  .strict();

export const titleRichTextSchema = z
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

export const propertiesSchema = z
  .record(z.string(), z.any())
  .default({})
  .describe(
    "Properties for the new page or database. Keys are property names, values are property value objects as per Notion API. See https://developers.notion.com/reference/page#property-value-types for details."
  );

export const dbFilterSchema = z
  .object({})
  .passthrough()
  .describe(
    "Filter object as per Notion API. Must match the Notion API filter structure. See https://developers.notion.com/reference/post-database-query-filter"
  );

export const dbSortSchema = z
  .object({
    property: z.string(),
    direction: z.enum(["ascending", "descending"]),
  })
  .strict()
  .describe(
    "Sort object as per Notion API. See https://developers.notion.com/reference/post-database-query-sort"
  );

export const dbSortsArraySchema = z
  .array(dbSortSchema)
  .describe("Array of sort objects as per Notion API.");

export const RichTextSchema = z
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

// =============================================================================
// Tool Schemas - Input schemas for each tool
// =============================================================================

export const searchSchema = {
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
};

export const retrievePageSchema = {
  pageId: z.string().describe("The Notion page ID."),
};

export const retrieveDatabaseSchemaSchema = {
  databaseId: z.string().describe("The Notion database ID."),
};

export const retrieveDatabaseContentSchema = {
  databaseId: z.string().describe("The Notion database ID."),
  filter: dbFilterSchema.optional(),
  sorts: dbSortsArraySchema.optional(),
  start_cursor: z.string().optional().describe("Start cursor for pagination."),
  page_size: z.number().optional().describe("Page size for pagination."),
};

export const queryDatabaseSchema = {
  databaseId: z.string().describe("The Notion database ID."),
  filter: dbFilterSchema.optional(),
  sorts: dbSortsArraySchema.optional(),
  start_cursor: z.string().optional().describe("Start cursor for pagination."),
  page_size: z.number().optional().describe("Page size for pagination."),
};

export const createPageSchema = {
  parent: parentPageSchema.describe(
    "The existing parent page where the new page is inserted. Must be an existing page ID. Use the search action to find a page ID."
  ),
  properties: propertiesSchema,
  icon: z.any().optional().describe("Icon (optional)."),
  cover: z.any().optional().describe("Cover (optional)."),
};

export const insertRowIntoDatabaseSchema = {
  databaseId: z.string().describe("The Notion database ID."),
  properties: propertiesSchema,
  icon: z.any().optional().describe("Icon (optional)."),
  cover: z.any().optional().describe("Cover (optional)."),
};

export const createDatabaseSchema = {
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
};

export const updatePageSchema = {
  pageId: z.string().describe("The Notion page ID."),
  properties: propertiesSchema,
};

export const retrieveBlockSchema = {
  blockId: z.string().describe("The Notion block ID."),
};

export const retrieveBlockChildrenSchema = {
  blockId: z.string().describe("The Notion block or page ID."),
  start_cursor: z.string().optional().describe("Start cursor for pagination."),
  page_size: z.number().optional().describe("Page size for pagination."),
};

export const addPageContentSchema = {
  blockId: z.string().describe("The ID of the parent block or page."),
  children: z
    .array(NotionBlockSchema)
    .describe(
      "Array of block objects to append as children. Blocks can be parented by other blocks, pages, or databases. There is a limit of 100 block children that can be appended by a single API request."
    ),
};

export const createCommentSchema = {
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
};

export const deleteBlockSchema = {
  blockId: z.string().describe("The ID of the block"),
};

export const deletePageSchema = {
  pageId: z.string().describe("The ID of the page"),
};

export const fetchCommentsSchema = {
  blockId: z
    .string()
    .describe("The ID of the page or block to fetch comments from."),
};

export const updateRowDatabaseSchema = {
  pageId: z.string().regex(uuidRegex).describe("The Notion page ID."),
  properties: propertiesSchema,
};

export const updateSchemaDatabaseSchema = {
  databaseId: z.string().describe("The Notion database ID."),
  properties: propertiesSchema,
};

export const listUsersSchema = {};

export const getAboutUserSchema = {
  userId: z.string().describe("The Notion user ID."),
};

// =============================================================================
// Tool Definitions - Static tool metadata for constants registry
// =============================================================================

export const NOTION_TOOLS: MCPToolType[] = [
  {
    name: "search",
    description: "Search for pages or databases in Notion.",
    inputSchema: zodToJsonSchema(z.object(searchSchema)) as JSONSchema7,
  },
  {
    name: "retrieve_page",
    description: "Retrieve a Notion page by its ID.",
    inputSchema: zodToJsonSchema(z.object(retrievePageSchema)) as JSONSchema7,
  },
  {
    name: "retrieve_database_schema",
    description: "Retrieve a Notion database's schema by its ID.",
    inputSchema: zodToJsonSchema(
      z.object(retrieveDatabaseSchemaSchema)
    ) as JSONSchema7,
  },
  {
    name: "retrieve_database_content",
    description: "Retrieve the content (pages) of a Notion database by its ID.",
    inputSchema: zodToJsonSchema(
      z.object(retrieveDatabaseContentSchema)
    ) as JSONSchema7,
  },
  {
    name: "query_database",
    description: "Query a Notion database.",
    inputSchema: zodToJsonSchema(z.object(queryDatabaseSchema)) as JSONSchema7,
  },
  {
    name: "create_page",
    description: "Create a new Notion page.",
    inputSchema: zodToJsonSchema(z.object(createPageSchema)) as JSONSchema7,
  },
  {
    name: "insert_row_into_database",
    description: "Create a new Notion page in a database.",
    inputSchema: zodToJsonSchema(
      z.object(insertRowIntoDatabaseSchema)
    ) as JSONSchema7,
  },
  {
    name: "create_database",
    description: "Create a new Notion database (table).",
    inputSchema: zodToJsonSchema(z.object(createDatabaseSchema)) as JSONSchema7,
  },
  {
    name: "update_page",
    description: "Update a Notion page's properties.",
    inputSchema: zodToJsonSchema(z.object(updatePageSchema)) as JSONSchema7,
  },
  {
    name: "retrieve_block",
    description: "Retrieve a Notion block by its ID.",
    inputSchema: zodToJsonSchema(z.object(retrieveBlockSchema)) as JSONSchema7,
  },
  {
    name: "retrieve_block_children",
    description: "Retrieve the children of a Notion block or page by its ID.",
    inputSchema: zodToJsonSchema(
      z.object(retrieveBlockChildrenSchema)
    ) as JSONSchema7,
  },
  {
    name: "add_page_content",
    description:
      "Add a single content block to a Notion page. For multiple blocks, call this action multiple times. Only supports adding to Notion pages. Blocks that can contain children include: page, toggle, to-do, bulleted list, numbered list, callout, and quote.",
    inputSchema: zodToJsonSchema(z.object(addPageContentSchema)) as JSONSchema7,
  },
  {
    name: "create_comment",
    description:
      "Create a comment on a Notion page or in an existing discussion thread. Provide either a parent page ID or a discussion ID. Inline comments to start a new thread are not supported via the public API.",
    inputSchema: zodToJsonSchema(z.object(createCommentSchema)) as JSONSchema7,
  },
  {
    name: "delete_block",
    description:
      "Archive (delete) block content in a page. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    inputSchema: zodToJsonSchema(z.object(deleteBlockSchema)) as JSONSchema7,
  },
  {
    name: "delete_page",
    description:
      "Archive (delete) a page or database row. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    inputSchema: zodToJsonSchema(z.object(deletePageSchema)) as JSONSchema7,
  },
  {
    name: "fetch_comments",
    description:
      "Retrieve a list of unresolved comment objects from a specified page or block in Notion.",
    inputSchema: zodToJsonSchema(z.object(fetchCommentsSchema)) as JSONSchema7,
  },
  {
    name: "update_row_database",
    description:
      "Update a specific property value in a row (page) of a Notion database. Value formats depend on the property type (e.g., text, number, select, date, people, URL, files, checkbox).",
    inputSchema: zodToJsonSchema(
      z.object(updateRowDatabaseSchema)
    ) as JSONSchema7,
  },
  {
    name: "update_schema_database",
    description:
      "Update the schema (columns/properties) of an existing Notion database.",
    inputSchema: zodToJsonSchema(
      z.object(updateSchemaDatabaseSchema)
    ) as JSONSchema7,
  },
  {
    name: "list_users",
    description: "List all users in the Notion workspace.",
    inputSchema: zodToJsonSchema(z.object(listUsersSchema)) as JSONSchema7,
  },
  {
    name: "get_about_user",
    description: "Get information about a specific user by userId.",
    inputSchema: zodToJsonSchema(z.object(getAboutUserSchema)) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const NOTION_SERVER_INFO = {
  name: "notion" as const,
  version: "1.0.0",
  description: "Access workspace pages and databases.",
  authorization: {
    provider: "notion" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "NotionLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/notion-mcp",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const NOTION_TOOL_STAKES = {
  search: "never_ask",
  retrieve_page: "never_ask",
  retrieve_database_schema: "never_ask",
  retrieve_database_content: "never_ask",
  query_database: "never_ask",
  retrieve_block: "never_ask",
  retrieve_block_children: "never_ask",
  fetch_comments: "never_ask",
  list_users: "never_ask",
  get_about_user: "never_ask",

  create_page: "low",
  insert_row_into_database: "low",
  create_database: "low",
  update_page: "low",
  add_page_content: "low",
  create_comment: "low",
  delete_block: "low",
  delete_page: "low",
  update_row_database: "low",
  update_schema_database: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
