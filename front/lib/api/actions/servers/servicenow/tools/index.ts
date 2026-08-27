import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { WritableIncidentFields } from "@app/lib/api/actions/servers/servicenow/client";
import { createServiceNowClient } from "@app/lib/api/actions/servers/servicenow/client";
import {
  CREATE_INCIDENT_TYPED_FIELD_NAMES,
  renderIncident,
  renderPaginationFooter,
  renderRecord,
  UPDATE_INCIDENT_TYPED_FIELD_NAMES,
  validateAdditionalFields,
} from "@app/lib/api/actions/servers/servicenow/helpers";
import { SERVICENOW_TOOLS_METADATA } from "@app/lib/api/actions/servers/servicenow/metadata";
import { Err, Ok } from "@app/types/shared/result";

function writableFieldsFromParams({
  shortDescription,
  description,
  urgency,
  impact,
  priority,
  category,
  assignmentGroup,
  state,
  workNotes,
  closeNotes,
  resolutionCode,
}: {
  shortDescription?: string;
  description?: string;
  urgency?: string;
  impact?: string;
  priority?: string;
  category?: string;
  assignmentGroup?: string;
  state?: string;
  workNotes?: string;
  closeNotes?: string;
  resolutionCode?: string;
}): WritableIncidentFields {
  return {
    ...(shortDescription !== undefined && {
      short_description: shortDescription,
    }),
    ...(description !== undefined && { description }),
    ...(urgency !== undefined && { urgency }),
    ...(impact !== undefined && { impact }),
    ...(priority !== undefined && { priority }),
    ...(category !== undefined && { category }),
    ...(assignmentGroup !== undefined && {
      assignment_group: assignmentGroup,
    }),
    ...(state !== undefined && { state }),
    ...(workNotes !== undefined && { work_notes: workNotes }),
    ...(closeNotes !== undefined && { close_notes: closeNotes }),
    ...(resolutionCode !== undefined && { close_code: resolutionCode }),
  };
}

const handlers: ToolHandlers<typeof SERVICENOW_TOOLS_METADATA> = {
  list_incidents: async (
    {
      query,
      fields,
      cursor,
      limit,
      openedAfter,
      openedBefore,
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

    const result = await client.listIncidents({
      query,
      fields,
      cursor,
      limit,
      openedAfter,
      openedBefore,
      updatedAfter,
      updatedBefore,
      includeTotalCount,
    });

    if (result.isErr()) {
      return result;
    }

    const {
      records: incidents,
      hasMore,
      nextCursor,
      returnedCount,
      totalCount,
    } = result.value;

    if (incidents.length === 0) {
      return new Ok([{ type: "text" as const, text: "No incidents found." }]);
    }

    let text = `Found ${incidents.length} incident(s):\n\n`;
    for (const incident of incidents) {
      text += renderIncident(incident) + "\n";
    }
    text += renderPaginationFooter({
      hasMore,
      nextCursor,
      returnedCount,
      totalCount,
    });

    return new Ok([{ type: "text" as const, text }]);
  },

  get_incident: async ({ incidentNumber }, { authInfo }) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const result = await client.getIncidentByNumber(incidentNumber);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(
        new MCPError(`No incident found with number "${incidentNumber}".`, {
          tracked: false,
        })
      );
    }

    return new Ok([
      { type: "text" as const, text: renderIncident(result.value) },
    ]);
  },

  create_incident: async ({ additionalFields, ...params }, { authInfo }) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const validatedAdditionalFields = validateAdditionalFields(
      additionalFields,
      CREATE_INCIDENT_TYPED_FIELD_NAMES
    );
    if (validatedAdditionalFields.isErr()) {
      return validatedAdditionalFields;
    }

    const result = await client.createIncident({
      ...writableFieldsFromParams(params),
      ...validatedAdditionalFields.value,
    });

    if (result.isErr()) {
      return result;
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Created incident ${result.value.number}:\n${renderIncident(result.value)}`,
      },
    ]);
  },

  update_incident: async (
    { incidentNumber, additionalFields, ...fields },
    { authInfo }
  ) => {
    const clientResult = createServiceNowClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    const validatedAdditionalFields = validateAdditionalFields(
      additionalFields,
      UPDATE_INCIDENT_TYPED_FIELD_NAMES
    );
    if (validatedAdditionalFields.isErr()) {
      return validatedAdditionalFields;
    }

    const mergedFields = {
      ...writableFieldsFromParams(fields),
      ...validatedAdditionalFields.value,
    };

    if (Object.keys(mergedFields).length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No fields to update were provided.",
        },
      ]);
    }

    const existingResult = await client.getIncidentByNumber(incidentNumber);
    if (existingResult.isErr()) {
      return existingResult;
    }
    if (!existingResult.value) {
      return new Err(
        new MCPError(`No incident found with number "${incidentNumber}".`, {
          tracked: false,
        })
      );
    }

    const result = await client.updateIncident(
      existingResult.value.sys_id,
      mergedFields
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok([
      {
        type: "text" as const,
        text: `Updated incident ${result.value.number}:\n${renderIncident(result.value)}`,
      },
    ]);
  },

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
};

export const TOOLS = buildTools(SERVICENOW_TOOLS_METADATA, handlers);
