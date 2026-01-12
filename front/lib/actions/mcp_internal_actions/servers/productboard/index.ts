import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getProductboardClient } from "@app/lib/actions/mcp_internal_actions/servers/productboard/client";
import {
  renderEntitiesList,
  renderEntityConfigurationsList,
  renderNote,
  renderNoteConfigurationsList,
  renderNotesList,
  renderRelationshipsList,
} from "@app/lib/actions/mcp_internal_actions/servers/productboard/rendering";
import type { ProductboardConfiguration } from "@app/lib/actions/mcp_internal_actions/servers/productboard/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const PRODUCTBOARD_TOOL_NAME = "productboard";

function getAccessTokenFromAuthInfo(
  authInfo: AuthInfo | undefined
): Result<string, MCPError> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(
      new MCPError(
        "No access token found. Please re-connect your Productboard account."
      )
    );
  }
  return new Ok(accessToken);
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("productboard");

  server.tool(
    "create_note",
    "Create a note in Productboard to capture customer feedback, insights, or support conversations.",

    {
      type: z
        .enum(["simple", "conversation"])
        .describe(
          "Note type: 'simple' for plain feedback, 'conversation' for chat/email threads"
        ),
      fields: z
        .object({})
        .passthrough()
        .describe("Fields matching the note object configuration."),
      relationships: z
        .array(
          z.object({
            type: z.enum(["customer", "link"]),
            target: z.object({
              id: z.string().uuid(),
              type: z.enum(["user", "company", "link"]),
            }),
          })
        )
        .optional()
        .describe(
          "Optional relationships to create with the note. Used for atomically linking notes to customers (users or companies) and product links (like features)."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ type, fields, relationships }, { authInfo }) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.createNote({
          type,
          fields,
          relationships,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to create note: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Note created with id ${result.value.id}. API endpoint: ${result.value.links.self} (Note: This is an API endpoint for programmatic access, not a user-facing link to view the note)`,
          },
        ]);
      }
    )
  );

  server.tool(
    "update_note",
    "Update an existing note in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    {
      note_id: z.string().uuid().describe("UUID of the note to update"),

      fields: z
        .object({})
        .passthrough()
        .optional()
        .describe(
          "Fields object for simple updates. Replaces entire field values."
        ),

      patch: z
        .array(
          z.union([
            z.object({
              op: z.enum(["set", "addItems", "removeItems"]),
              path: z.string(),
              value: z.unknown(),
            }),
            z.object({
              op: z.literal("clear"),
              path: z.string(),
            }),
          ])
        )
        .optional()
        .describe("Patch operations array for granular updates"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ note_id, fields, patch }, { authInfo }) => {
        if (!fields && !patch) {
          return new Err(
            new MCPError(
              "Either 'fields' or 'patch' must be provided to update the note."
            )
          );
        }

        if (fields && patch) {
          return new Err(
            new MCPError(
              "Cannot use both 'fields' and 'patch' in the same update. Use either 'fields' for simple updates or 'patch' for granular operations."
            )
          );
        }

        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.updateNote(note_id, {
          fields: fields && Object.keys(fields).length > 0 ? fields : undefined,
          patch: patch && patch.length > 0 ? patch : undefined,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to update note: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Note updated with id ${result.value.id}`,
          },
        ]);
      }
    )
  );

  server.tool(
    "get_note",
    "Retrieve details of a specific note by ID. Use field selection to optimize response size and avoid large returns. By default, returns all non-null fields.",
    {
      note_id: z.string().describe("UUID of the note to retrieve"),
      fields: z
        .array(z.string())
        .optional()
        .describe("OList of specific fields to retrieve"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ note_id, fields }, { authInfo }) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.getNote(note_id, fields);

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to get note: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderNote(result.value),
          },
        ]);
      }
    )
  );

  server.tool(
    "query_notes",
    `Search for notes in your Productboard workspace. Notes are sorted by creation date, newest first.`,
    {
      page_cursor: z.string().optional().describe("Cursor for pagination"),
      archived: z
        .boolean()
        .optional()
        .describe("Filter notes by archived status"),
      processed: z
        .boolean()
        .optional()
        .describe("Filter notes by processed status"),
      owner_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter notes by owner UUID"),
      owner_email: z
        .string()
        .email()
        .optional()
        .describe("Filter notes by owner email"),
      creator_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter notes by creator UUID"),
      creator_email: z
        .string()
        .email()
        .optional()
        .describe("Filter notes by creator email"),
      source_record_id: z
        .string()
        .optional()
        .describe("Filter notes by external source record ID"),
      created_from: z
        .string()
        .optional()
        .describe(
          "Filter notes created on or after this date/time (ISO-8601, inclusive)"
        ),
      created_to: z
        .string()
        .optional()
        .describe(
          "Filter notes created on or before this date/time (ISO-8601, inclusive)"
        ),
      updated_from: z
        .string()
        .optional()
        .describe(
          "Filter notes updated on or after this date/time (ISO-8601, inclusive)"
        ),
      updated_to: z
        .string()
        .optional()
        .describe(
          "Filter notes updated on or before this date/time (ISO-8601, inclusive)"
        ),
      fields: z
        .string()
        .optional()
        .describe(
          "Field selection: 'all' for all fields including null, or comma-separated field names (e.g., 'name,tags,content')"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async (
        {
          page_cursor,
          archived,
          processed,
          owner_id,
          owner_email,
          creator_id,
          creator_email,
          source_record_id,
          created_from,
          created_to,
          updated_from,
          updated_to,
          fields,
        },
        { authInfo }
      ) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.queryNotes({
          pageCursor: page_cursor,
          archived,
          processed,
          ownerId: owner_id,
          ownerEmail: owner_email,
          creatorId: creator_id,
          creatorEmail: creator_email,
          sourceRecordId: source_record_id,
          createdFrom: created_from,
          createdTo: created_to,
          updatedFrom: updated_from,
          updatedTo: updated_to,
          fields,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to query notes: ${normalizeError(result.error).message}`
            )
          );
        }

        const { notes, pageCursor, totalResults } = result.value;

        return new Ok([
          {
            type: "text" as const,
            text: renderNotesList(notes, { pageCursor, totalResults }),
          },
        ]);
      }
    )
  );

  server.tool(
    "query_entities",
    `Search for entities in Productboard, including products, companies, features, users, etc.`,
    {
      type: z
        .enum([
          "product",
          "component",
          "feature",
          "subfeature",
          "initiative",
          "objective",
          "keyResult",
          "release",
          "releaseGroup",
          "company",
          "user",
        ])
        .describe("Entity type to search"),
      name: z.string().max(255).optional().describe("Filter by entity name"),
      archived: z.boolean().optional().describe("Filter by archived status"),
      parent_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter by parent entity UUID"),
      ids: z
        .array(z.string().uuid())
        .optional()
        .describe("Filter by specific entity UUIDs"),
      status_ids: z
        .array(z.string().uuid())
        .optional()
        .describe("Filter by status UUIDs"),
      status_names: z
        .array(z.string())
        .optional()
        .describe("Filter by status names"),
      owner_ids: z
        .array(z.string().uuid())
        .optional()
        .describe("Filter by owner UUIDs"),
      owner_emails: z
        .array(z.string().email())
        .optional()
        .describe("Filter by owner emails"),
      timeframe_start_date: z
        .string()
        .optional()
        .describe(
          "Filter by timeframe start date (ISO date format YYYY-MM-DD)"
        ),
      timeframe_end_date: z
        .string()
        .optional()
        .describe("Filter by timeframe end date (ISO date format YYYY-MM-DD)"),
      fields: z
        .enum(["all", "default"])
        .optional()
        .describe(
          "Field selection: 'all' includes null values, 'default' only non-null"
        ),
      page_cursor: z.string().optional().describe("Pagination cursor"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async (
        {
          type,
          name,
          archived,
          parent_id,
          ids,
          status_ids,
          status_names,
          owner_ids,
          owner_emails,
          timeframe_start_date,
          timeframe_end_date,
          fields,
          page_cursor,
        },
        { authInfo }
      ) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.searchEntities({
          type,
          name,
          archived,
          parentId: parent_id,
          ids,
          statusIds: status_ids,
          statusNames: status_names,
          ownerIds: owner_ids,
          ownerEmails: owner_emails,
          timeframeStartDate: timeframe_start_date,
          timeframeEndDate: timeframe_end_date,
          fields,
          pageCursor: page_cursor,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to query entities: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderEntitiesList(result.value.entities, {
              pageCursor: result.value.pageCursor,
            }),
          },
        ]);
      }
    )
  );

  server.tool(
    "create_entity",
    "Create an entity in Productboard (products, components, features, initiatives, etc.)",
    {
      type: z
        .enum([
          "product",
          "component",
          "feature",
          "subfeature",
          "initiative",
          "objective",
          "keyResult",
          "release",
          "releaseGroup",
          "company",
          "user",
        ])
        .describe("Entity type to create"),
      fields: z
        .object({})
        .passthrough()
        .describe("Fields matching the entity object configuration."),
      relationships: z
        .array(
          z.object({
            type: z.enum([
              "parent",
              "child",
              "link",
              "isBlockedBy",
              "isBlocking",
            ]),
            target: z.object({
              id: z.string().uuid(),
            }),
          })
        )
        .optional()
        .describe(
          "Relationships to create with the entity. Used for linking to parent entities, children, or other relationships."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ type, fields, relationships }, { authInfo }) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.createEntity({
          type,
          fields,
          relationships,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to create entity: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Entity created with id ${result.value.id}. API endpoint: ${result.value.links.self} (Note: This is an API endpoint for programmatic access, not a user-facing link to view the entity)`,
          },
        ]);
      }
    )
  );

  server.tool(
    "update_entity",
    "Update an existing entity in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    {
      entity_id: z.string().uuid().describe("UUID of the entity to update"),

      fields: z
        .object({})
        .passthrough()
        .optional()
        .describe(
          "Fields object for simple updates. Replaces entire field values."
        ),

      patch: z
        .array(
          z.union([
            z.object({
              op: z.enum(["set", "addItems", "removeItems"]),
              path: z.string(),
              value: z.unknown(),
            }),
            z.object({
              op: z.literal("clear"),
              path: z.string(),
            }),
          ])
        )
        .optional()
        .describe("Patch operations array for granular updates"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ entity_id, fields, patch }, { authInfo }) => {
        if (!fields && !patch) {
          return new Err(
            new MCPError(
              "At least one of 'fields' or 'patch' must be provided."
            )
          );
        }

        if (fields && patch) {
          return new Err(
            new MCPError(
              "Cannot use both 'fields' and 'patch' in the same request."
            )
          );
        }

        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.updateEntity(entity_id, {
          fields: fields && Object.keys(fields).length > 0 ? fields : undefined,
          patch: patch && patch.length > 0 ? patch : undefined,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to update entity: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Entity with id ${result.value.id} updated successfully.`,
          },
        ]);
      }
    )
  );

  server.tool(
    "get_relationships",
    `Get relationships for an entity (parent, children, linked notes, etc.).

Use to understand how entities are connected in the product hierarchy.`,
    {
      entity_id: z.string().uuid().describe("UUID of the entity"),
      relationship_type: z
        .string()
        .optional()
        .describe(
          "Filter by relationship type (e.g., 'parent', 'child', 'link')"
        ),
      page_cursor: z.string().optional().describe("Pagination cursor"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ entity_id, relationship_type, page_cursor }, { authInfo }) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        const result = await client.getEntityRelationships(entity_id, {
          relationshipType: relationship_type,
          pageCursor: page_cursor,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to get relationships: ${normalizeError(result.error).message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderRelationshipsList(result.value.relationships, {
              pageCursor: result.value.pageCursor,
              entityId: entity_id,
            }),
          },
        ]);
      }
    )
  );

  server.tool(
    "get_configuration",
    "Get configuration for a specific entity type in this workspace. This is REQUIRED before creating or updating any entity or note. Returns available fields, required vs optional fields, field types, constraints, and allowed operations.",
    {
      entity_type: z
        .enum([
          "simple",
          "conversation",
          "product",
          "component",
          "feature",
          "subfeature",
          "initiative",
          "objective",
          "keyResult",
          "release",
          "releaseGroup",
          "company",
          "user",
        ])
        .describe(
          "Entity type to get configuration for. Note types: 'simple', 'conversation'. Entity types: 'product', 'component', 'feature', etc."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: PRODUCTBOARD_TOOL_NAME, agentLoopContext },
      async ({ entity_type }, { authInfo }) => {
        const accessTokenResult = getAccessTokenFromAuthInfo(authInfo);
        if (accessTokenResult.isErr()) {
          return accessTokenResult;
        }

        const clientResult = getProductboardClient(accessTokenResult.value);
        if (clientResult.isErr()) {
          return clientResult;
        }
        const client = clientResult.value;

        let config: ProductboardConfiguration;

        if (entity_type === "simple" || entity_type === "conversation") {
          const result = await client.getNotesConfigurations();
          if (result.isErr()) {
            return new Err(
              new MCPError(
                `Failed to get note configuration: ${normalizeError(result.error).message}`
              )
            );
          }
          const noteConfig = result.value.find((c) => c.type === entity_type);
          if (!noteConfig) {
            return new Err(
              new MCPError(
                `Configuration for note type '${entity_type}' not found`
              )
            );
          }
          config = noteConfig;
        } else {
          const result = await client.getEntityConfiguration(entity_type);
          if (result.isErr()) {
            return new Err(
              new MCPError(
                `Failed to get entity configuration: ${normalizeError(result.error).message}`
              )
            );
          }
          config = result.value;
        }

        const isNoteType =
          entity_type === "simple" || entity_type === "conversation";
        const text = isNoteType
          ? renderNoteConfigurationsList([config])
          : renderEntityConfigurationsList([config]);

        return new Ok([
          {
            type: "text" as const,
            text,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
