import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const NOTION_TOOL_NAME = "notion" as const;

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

const parentPageSchema = z
  .object({
    type: z.literal("page_id").describe("Must be 'page_id' for a page parent."),
    page_id: z.string().regex(uuidRegex).describe("The ID of the parent page."),
  })
  .strict();

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

export const NOTION_TOOLS_METADATA = createToolsRecord({
  search: {
    description: "Search for pages or databases in Notion.",
    schema: {
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
    stake: "never_ask",
    displayLabels: {
      running: "Searching Notion",
      done: "Search Notion",
    },
  },
  retrieve_page: {
    description: "Retrieve a Notion page by its ID.",
    schema: {
      pageId: z.string().describe("The Notion page ID."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion page",
      done: "Retrieve Notion page",
    },
  },
  retrieve_database_schema: {
    description: "Retrieve a Notion database's schema by its ID.",
    schema: {
      databaseId: z.string().describe("The Notion database ID."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion database schema",
      done: "Retrieve Notion database schema",
    },
  },
  retrieve_database_content: {
    description: "Retrieve the content (pages) of a Notion database by its ID.",
    schema: {
      databaseId: z.string().describe("The Notion database ID."),
      filter: dbFilterSchema.optional(),
      sorts: dbSortsArraySchema.optional(),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion database content",
      done: "Retrieve Notion database content",
    },
  },
  query_database: {
    description: "Query a Notion database.",
    schema: {
      databaseId: z.string().describe("The Notion database ID."),
      filter: dbFilterSchema.optional(),
      sorts: dbSortsArraySchema.optional(),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying Notion database",
      done: "Query Notion database",
    },
  },
  create_page: {
    description: "Create a new Notion page.",
    schema: {
      parent: parentPageSchema.describe(
        "The existing parent page where the new page is inserted. Must be an existing page ID. Use the search action to find a page ID."
      ),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Notion page",
      done: "Create Notion page",
    },
  },
  insert_row_into_database: {
    description: "Create a new Notion page in a database.",
    schema: {
      databaseId: z.string().describe("The Notion database ID."),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    stake: "low",
    displayLabels: {
      running: "Inserting Notion row",
      done: "Insert Notion row",
    },
  },
  create_database: {
    description: "Create a new Notion database (table).",
    schema: {
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
    stake: "low",
    displayLabels: {
      running: "Creating Notion database",
      done: "Create Notion database",
    },
  },
  update_page: {
    description: "Update a Notion page's properties.",
    schema: {
      pageId: z.string().describe("The Notion page ID."),
      properties: propertiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Updating Notion page",
      done: "Update Notion page",
    },
  },
  retrieve_block: {
    description: "Retrieve a Notion block by its ID.",
    schema: {
      blockId: z.string().describe("The Notion block ID."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion block",
      done: "Retrieve Notion block",
    },
  },
  retrieve_block_children: {
    description: "Retrieve the children of a Notion block or page by its ID.",
    schema: {
      blockId: z.string().describe("The Notion block or page ID."),
      start_cursor: z
        .string()
        .optional()
        .describe("Start cursor for pagination."),
      page_size: z.number().optional().describe("Page size for pagination."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion block children",
      done: "Retrieve Notion block children",
    },
  },
  add_page_content: {
    description:
      "Add a single content block to a Notion page. For multiple blocks, call this action multiple times. Only supports adding to Notion pages. Blocks that can contain children include: page, toggle, to-do, bulleted list, numbered list, callout, and quote.",
    schema: {
      after: z
        .string()
        .optional()
        .describe("The ID of the existing block to insert after."),
      blockId: z.string().describe("The ID of the parent block or page."),
      children: z
        .array(NotionBlockSchema)
        .describe(
          "Array of block objects to append as children. Blocks can be parented by other blocks, pages, or databases. There is a limit of 100 block children that can be appended by a single API request."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Adding Notion page content",
      done: "Add Notion page content",
    },
  },
  create_comment: {
    description:
      "Create a comment on a Notion page or in an existing discussion thread. Provide either a parent page ID or a discussion ID. Inline comments to start a new thread are not supported via the public API.",
    schema: {
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
    stake: "low",
    displayLabels: {
      running: "Adding comment on Notion",
      done: "Add comment on Notion",
    },
  },
  delete_block: {
    description:
      "Archive (delete) block content in a page. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    schema: {
      blockId: z.string().describe("The ID of the block"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting Notion block",
      done: "Delete Notion block",
    },
  },
  delete_page: {
    description:
      "Archive (delete) a page or database row. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    schema: {
      pageId: z.string().describe("The ID of the page"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting Notion page",
      done: "Delete Notion page",
    },
  },
  fetch_comments: {
    description:
      "Retrieve a list of unresolved comment objects from a specified page or block in Notion.",
    schema: {
      blockId: z
        .string()
        .describe("The ID of the page or block to fetch comments from."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching comments from Notion",
      done: "Fetch comments from Notion",
    },
  },
  update_row_database: {
    description:
      "Update a specific property value in a row (page) of a Notion database. Value formats depend on the property type (e.g., text, number, select, date, people, URL, files, checkbox).",
    schema: {
      pageId: z.string().regex(uuidRegex).describe("The Notion page ID."),
      properties: propertiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Updating Notion row",
      done: "Update Notion row",
    },
  },
  update_schema_database: {
    description:
      "Update the schema (columns/properties) of an existing Notion database.",
    schema: {
      databaseId: z.string().describe("The Notion database ID."),
      properties: propertiesSchema,
    },
    stake: "low",
    displayLabels: {
      running: "Updating Notion database schema",
      done: "Update Notion database schema",
    },
  },
  list_users: {
    description: "List all users in the Notion workspace.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Notion users",
      done: "List Notion users",
    },
  },
  get_about_user: {
    description: "Get information about a specific user by userId.",
    schema: {
      userId: z.string().describe("The Notion user ID."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving Notion user info",
      done: "Retrieve Notion user info",
    },
  },
});

export const NOTION_SERVER = {
  serverInfo: {
    name: "notion",
    version: "1.0.0",
    description: "Access workspace pages and databases.",
    authorization: {
      provider: "notion",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "NotionLogo",
    documentationUrl: "https://docs.dust.tt/docs/notion-mcp",
    instructions: null,
  },
  tools: Object.values(NOTION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(NOTION_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
