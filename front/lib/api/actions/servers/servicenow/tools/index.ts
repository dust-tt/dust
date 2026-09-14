import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createServiceNowClient } from "@app/lib/api/actions/servers/servicenow/client";
import {
  renderPaginationFooter,
  renderRecord,
  validateWritableFields,
} from "@app/lib/api/actions/servers/servicenow/helpers";
import { SERVICENOW_TOOLS_METADATA } from "@app/lib/api/actions/servers/servicenow/metadata";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof SERVICENOW_TOOLS_METADATA> = {
  list_records: async (
    {
      table,
      query,
      fields,
      limit,
      cursor,
      createdAfter,
      createdBefore,
      updatedAfter,
      updatedBefore,
      includeTotalCount,
    },
    { authInfo }
  ) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.listRecords(table, {
      query,
      fields,
      limit,
      cursor,
      createdAfter,
      createdBefore,
      updatedAfter,
      updatedBefore,
      includeTotalCount,
    });

    if (result.isErr()) {
      return result;
    }

    const { records, hasMore, nextCursor, returnedCount, totalCount } =
      result.value;

    if (records.length === 0) {
      return new Ok([
        { type: "text" as const, text: `No records found in "${table}".` },
      ]);
    }

    let text = `Found ${records.length} record(s) in "${table}":\n\n`;
    for (const record of records) {
      text += renderRecord(record) + "\n";
    }
    text += renderPaginationFooter({
      hasMore,
      nextCursor,
      returnedCount,
      totalCount,
    });

    return new Ok([{ type: "text" as const, text }]);
  },

  get_record: async ({ table, sysId, fields }, { authInfo }) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.getRecord(table, sysId, fields);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(
        new MCPError(`No record found in "${table}" with sys_id "${sysId}".`, {
          tracked: false,
        })
      );
    }

    return new Ok([
      { type: "text" as const, text: renderRecord(result.value) },
    ]);
  },

  // Note: `fields` here is a field-name-to-value map to write (see WRITE_FIELDS_SCHEMA in
  // metadata.ts) — not the same shape as list_records/get_record's `fields`, which is an array
  // of field names to project in the response.
  create_record: async ({ table, fields }, { authInfo }) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const validatedFields = validateWritableFields(fields);
    if (validatedFields.isErr()) {
      return validatedFields;
    }
    // Unlike update_record below, an empty field set here is an error rather than a benign
    // no-op: there's no meaningful "create nothing" operation to fall back to.
    if (Object.keys(validatedFields.value).length === 0) {
      return new Err(
        new MCPError("No fields were provided to create the record with.", {
          tracked: false,
        })
      );
    }

    const result = await client.createRecord(table, validatedFields.value);

    if (result.isErr()) {
      return result;
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Created record in "${table}":\n${renderRecord(result.value)}`,
      },
    ]);
  },

  update_record: async ({ table, sysId, fields }, { authInfo }) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const validatedFields = validateWritableFields(fields);
    if (validatedFields.isErr()) {
      return validatedFields;
    }
    // Unlike create_record above, an empty field set is a benign no-op here — the caller may
    // have legitimately requested no changes, so this isn't an error.
    if (Object.keys(validatedFields.value).length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No fields to update were provided.",
        },
      ]);
    }

    const result = await client.updateRecord(
      table,
      sysId,
      validatedFields.value
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Updated record in "${table}":\n${renderRecord(result.value)}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(SERVICENOW_TOOLS_METADATA, handlers);
