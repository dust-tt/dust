import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getProductboardClient } from "@app/lib/api/actions/servers/productboard/client";
import { PRODUCTBOARD_TOOLS_METADATA } from "@app/lib/api/actions/servers/productboard/metadata";
import {
  renderEntitiesList,
  renderEntityConfigurationsList,
  renderNote,
  renderNoteConfigurationsList,
  renderNotesList,
  renderRelationshipsList,
} from "@app/lib/api/actions/servers/productboard/rendering";
import type { ProductboardConfiguration } from "@app/lib/api/actions/servers/productboard/types";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

function getAccessToken(
  authInfo: ToolHandlerExtra["authInfo"]
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

export function createProductboardTools(): ToolDefinition[] {
  const handlers: ToolHandlers<typeof PRODUCTBOARD_TOOLS_METADATA> = {
    create_note: async ({ type, fields, relationships }, { authInfo }) => {
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    update_note: async ({ note_id, fields, patch }, { authInfo }) => {
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

      const accessTokenResult = getAccessToken(authInfo);
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
    },

    get_note: async ({ note_id, fields }, { authInfo }) => {
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    query_notes: async (
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
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    query_entities: async (
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
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    create_entity: async ({ type, fields, relationships }, { authInfo }) => {
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    update_entity: async ({ entity_id, fields, patch }, { authInfo }) => {
      if (!fields && !patch) {
        return new Err(
          new MCPError("At least one of 'fields' or 'patch' must be provided.")
        );
      }

      if (fields && patch) {
        return new Err(
          new MCPError(
            "Cannot use both 'fields' and 'patch' in the same request."
          )
        );
      }

      const accessTokenResult = getAccessToken(authInfo);
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
    },

    get_relationships: async (
      { entity_id, relationship_type, page_cursor },
      { authInfo }
    ) => {
      const accessTokenResult = getAccessToken(authInfo);
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
    },

    get_configuration: async ({ entity_type }, { authInfo }) => {
      const accessTokenResult = getAccessToken(authInfo);
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
    },
  };

  return buildTools(PRODUCTBOARD_TOOLS_METADATA, handlers);
}
