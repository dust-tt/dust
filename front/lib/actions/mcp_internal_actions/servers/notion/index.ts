import type { Result } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import type {
  CreateCommentParameters,
  QueryDatabaseParameters,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { APIResponseError } from "@notionhq/client/build/src/errors";
import { parseISO } from "date-fns";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  addPageContentSchema,
  createCommentSchema,
  createDatabaseSchema,
  createPageSchema,
  deleteBlockSchema,
  deletePageSchema,
  fetchCommentsSchema,
  getAboutUserSchema,
  insertRowIntoDatabaseSchema,
  listUsersSchema,
  NOTION_TOOL_NAME,
  queryDatabaseSchema,
  retrieveBlockChildrenSchema,
  retrieveBlockSchema,
  retrieveDatabaseContentSchema,
  retrieveDatabaseSchemaSchema,
  retrievePageSchema,
  searchSchema,
  updatePageSchema,
  updateRowDatabaseSchema,
  updateSchemaDatabaseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/notion/metadata";
import {
  makeInternalMCPServer,
  makePersonalAuthenticationError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { NOTION_SEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import { getRefs } from "@app/lib/api/assistant/citations";
import type { Authenticator } from "@app/lib/auth";
import {
  Err,
  normalizeError,
  Ok,
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types";

async function withNotionClient<T>(
  fn: (notion: Client) => Promise<T>,
  authInfo?: AuthInfo
): Promise<Result<CallToolResult["content"], MCPError>> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Ok(makePersonalAuthenticationError("notion").content);
  }

  try {
    const notion = new Client({ auth: accessToken });

    const result = await fn(notion);

    return new Ok([
      { type: "text" as const, text: "Success" },
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ]);
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

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("notion");

  server.tool(
    "search",
    "Search for pages or databases in Notion.",
    searchSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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

          return new Ok(
            resultResources.map((result) =>
              typeof result === "string"
                ? {
                    type: "text" as const,
                    text: result,
                  }
                : {
                    type: "resource" as const,
                    resource: result,
                  }
            )
          );
        }
      }
    )
  );

  server.tool(
    "retrieve_page",
    "Retrieve a Notion page by its ID.",
    retrievePageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    retrieveDatabaseSchemaSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    retrieveDatabaseContentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    queryDatabaseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    createPageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    insertRowIntoDatabaseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    createDatabaseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    updatePageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    retrieveBlockSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    retrieveBlockChildrenSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    addPageContentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
      },
      async ({ blockId, children }, { authInfo }) => {
        return withNotionClient(
          (notion) =>
            notion.blocks.children.append({
              block_id: blockId,
              children,
            }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "create_comment",
    "Create a comment on a Notion page or in an existing discussion thread. Provide either a parent page ID or a discussion ID. Inline comments to start a new thread are not supported via the public API.",
    createCommentSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    "Archive (delete) block content in a page. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    deleteBlockSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    "delete_page",
    "Archive (delete) a page or database row. In the Notion UI, this moves the block to the 'trash,' where it can be restored if needed.",
    deletePageSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
      },
      async ({ pageId }, { authInfo }) => {
        return withNotionClient(
          (notion) => notion.pages.update({ page_id: pageId, in_trash: true }),
          authInfo
        );
      }
    )
  );

  server.tool(
    "fetch_comments",
    "Retrieve a list of unresolved comment objects from a specified page or block in Notion.",
    fetchCommentsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    updateRowDatabaseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    updateSchemaDatabaseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
    listUsersSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        return withNotionClient((notion) => notion.users.list({}), authInfo);
      }
    )
  );

  server.tool(
    "get_about_user",
    "Get information about a specific user by userId.",
    getAboutUserSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: NOTION_TOOL_NAME,
        agentLoopContext,
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
}

export default createServer;
