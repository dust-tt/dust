import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@notionhq/client";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "notion",
  version: "1.0.0",
  description: "Notion tools to manage pages and databases.",
  authorization: {
    provider: "notion" as const,
    use_case: "platform_actions" as const,
  },
  icon: "NotionLogo",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  const parentPageSchema = z
    .object({
      type: z
        .literal("page_id")
        .describe("Must be 'page_id' for a page parent."),
      page_id: z.string().describe("The ID of the parent page."),
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

  const searchFilterSchema = z
    .object({
      property: z.literal("object"),
      value: z.enum(["page", "database"]),
    })
    .describe(
      "A set of criteria, value and property keys, that limits the results to either only pages or only databases. Only property: 'object' and value: 'page' or 'database' are allowed."
    );

  const searchSortSchema = z
    .object({
      direction: z.enum(["ascending", "descending"]),
      timestamp: z.literal("last_edited_time"),
    })
    .describe(
      "A set of criteria, direction and timestamp keys, that orders the results. Only timestamp: 'last_edited_time' is allowed."
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

  server.tool(
    "search",
    "Search for pages, databases, or blocks in Notion.",
    {
      query: z.string().optional().describe("Search query string."),
      filter: searchFilterSchema.optional(),
      sort: searchSortSchema.optional(),
      start_cursor: z
        .string()
        .optional()
        .describe(
          "A cursor value returned in a previous response that limits the response to results starting after the cursor."
        ),
      page_size: z
        .number()
        .optional()
        .describe(
          "The number of items from the full list to include in the response. Maximum: 100."
        ),
    },
    async ({ query, filter, sort, start_cursor, page_size }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.search({
          query,
          filter,
          sort,
          start_cursor,
          page_size,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "retrieve_page",
    "Retrieve a Notion page by its ID.",
    {
      pageId: z.string().describe("The Notion page ID."),
    },
    async ({ pageId }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.pages.retrieve({ page_id: pageId });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "retrieve_database_schema",
    "Retrieve a Notion database's schema by its ID.",
    {
      databaseId: z.string().describe("The Notion database ID."),
    },
    async ({ databaseId }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.databases.retrieve({
          database_id: databaseId,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
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
    async ({ databaseId, filter, sorts, start_cursor, page_size }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.databases.query({
          database_id: databaseId,
          filter: filter as any,
          sorts,
          start_cursor,
          page_size,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
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
    async ({ databaseId, filter, sorts, start_cursor, page_size }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.databases.query({
          database_id: databaseId,
          filter: filter as any,
          sorts,
          start_cursor,
          page_size,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "create_page",
    "Create a new Notion page.",
    {
      parent: parentPageSchema.describe(
        "Parent object (see Notion API). Must include type: 'page_id' and a valid page_id."
      ),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    async ({ parent, properties, icon, cover }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.pages.create({
          parent,
          properties,
          icon,
          cover,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "create_page_from_database",
    "Create a new Notion page in a database.",
    {
      databaseId: z.string().describe("The Notion database ID."),
      properties: propertiesSchema,
      icon: z.any().optional().describe("Icon (optional)."),
      cover: z.any().optional().describe("Cover (optional)."),
    },
    async ({ databaseId, properties, icon, cover }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.pages.create({
          parent: { database_id: databaseId, type: "database_id" },
          properties,
          icon,
          cover,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "create_database",
    "Create a new Notion database (table).",
    {
      parent: parentPageSchema.describe(
        "Parent object (see Notion API). Must include type: 'page_id' and a valid page_id."
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
    async ({ parent, title, properties, icon, cover }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.databases.create({
          parent,
          title,
          properties,
          icon,
          cover,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  server.tool(
    "update_page",
    "Update a Notion page's properties.",
    {
      pageId: z.string().describe("The Notion page ID."),
      properties: propertiesSchema,
    },
    async ({ pageId, properties }) => {
      try {
        const notion = await getNotionClient(auth, mcpServerId);
        if (!notion) {
          return {
            isError: true,
            content: [{ type: "text", text: "No access token found" }],
          };
        }
        const result = await notion.pages.update({
          page_id: pageId,
          properties,
        });
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (e: any) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    }
  );

  return server;
};

const getNotionClient = async (
  auth: any,
  mcpServerId: string
): Promise<Client | null> => {
  const accessToken = await getAccessTokenForInternalMCPServer(auth, {
    mcpServerId,
  });
  if (!accessToken) {
    return null;
  }
  return new Client({ auth: accessToken });
};

export default createServer;
