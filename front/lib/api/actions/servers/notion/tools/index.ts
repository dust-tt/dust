// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { NOTION_SEARCH_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import { NOTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/notion/metadata";
import { getRefs } from "@app/lib/api/assistant/citations";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  parseTimeFrame,
  timeFrameFromNow,
} from "@app/types/shared/utils/time_frame";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import type {
  CreateCommentParameters,
  QueryDatabaseParameters,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { APIResponseError } from "@notionhq/client/build/src/errors";
import { parseISO } from "date-fns";

async function withNotionClient<T>(
  fn: (notion: Client) => Promise<T>,
  authInfo?: AuthInfo
): Promise<ToolHandlerResult> {
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

export function createNotionTools(
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof NOTION_TOOLS_METADATA> = {
    search: async (
      { query, type, relativeTimeFrame },
      { authInfo }: ToolHandlerExtra
    ) => {
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
              ref: refs.shift() ?? "",
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
              ref: refs.shift() ?? "",
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
    },

    retrieve_page: async ({ pageId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.pages.retrieve({ page_id: pageId }),
        authInfo
      );
    },

    retrieve_database_schema: async ({ databaseId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.databases.retrieve({ database_id: databaseId }),
        authInfo
      );
    },

    retrieve_database_content: async (
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
    },

    query_database: async (
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
    },

    create_page: async ({ parent, properties, icon, cover }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.pages.create({ parent, properties, icon, cover }),
        authInfo
      );
    },

    insert_row_into_database: async (
      { databaseId, properties, icon, cover },
      { authInfo }
    ) => {
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
    },

    create_database: async (
      { parent, title, properties, icon, cover },
      { authInfo }
    ) => {
      return withNotionClient(
        (notion) =>
          notion.databases.create({ parent, title, properties, icon, cover }),
        authInfo
      );
    },

    update_page: async ({ pageId, properties }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.pages.update({ page_id: pageId, properties }),
        authInfo
      );
    },

    retrieve_block: async ({ blockId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.blocks.retrieve({ block_id: blockId }),
        authInfo
      );
    },

    retrieve_block_children: async (
      { blockId, start_cursor, page_size },
      { authInfo }
    ) => {
      return withNotionClient(
        (notion) =>
          notion.blocks.children.list({
            block_id: blockId,
            start_cursor,
            page_size,
          }),
        authInfo
      );
    },

    add_page_content: async ({ after, blockId, children }, { authInfo }) => {
      return withNotionClient(
        (notion) =>
          notion.blocks.children.append({
            after,
            block_id: blockId,
            children,
          }),
        authInfo
      );
    },

    create_comment: async (
      { parent_page_id, discussion_id, comment },
      { authInfo }
    ) => {
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
    },

    delete_block: async ({ blockId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.blocks.update({ block_id: blockId, archived: true }),
        authInfo
      );
    },

    delete_page: async ({ pageId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.pages.update({ page_id: pageId, in_trash: true }),
        authInfo
      );
    },

    fetch_comments: async ({ blockId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.comments.list({ block_id: blockId }),
        authInfo
      );
    },

    update_row_database: async ({ pageId, properties }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.pages.update({ page_id: pageId, properties }),
        authInfo
      );
    },

    update_schema_database: async (
      { databaseId, properties },
      { authInfo }
    ) => {
      return withNotionClient(
        (notion) =>
          notion.databases.update({ database_id: databaseId, properties }),
        authInfo
      );
    },

    list_users: async (_params, { authInfo }) => {
      return withNotionClient((notion) => notion.users.list({}), authInfo);
    },

    get_about_user: async ({ userId }, { authInfo }) => {
      return withNotionClient(
        (notion) => notion.users.retrieve({ user_id: userId }),
        authInfo
      );
    },
  };

  return buildTools(NOTION_TOOLS_METADATA, handlers);
}
