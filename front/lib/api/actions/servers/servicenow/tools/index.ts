import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  createIncident,
  getIncidentByNumber,
  getServiceNowCredentials,
  listIncidents,
  updateIncident,
  type WritableIncidentFields,
} from "@app/lib/api/actions/servers/servicenow/client";
import { renderIncident } from "@app/lib/api/actions/servers/servicenow/helpers";
import { SERVICENOW_TOOLS_METADATA } from "@app/lib/api/actions/servers/servicenow/metadata";
import { Ok } from "@app/types/shared/result";

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
  list_incidents: async ({ query, limit }, { authInfo }) => {
    const credentialsResult = getServiceNowCredentials(authInfo);
    if (credentialsResult.isErr()) {
      return credentialsResult;
    }
    const { accessToken, instanceUrl } = credentialsResult.value;

    const result = await listIncidents(accessToken, instanceUrl, {
      query,
      limit,
    });

    if (result.isErr()) {
      return result;
    }

    const incidents = result.value;

    if (incidents.length === 0) {
      return new Ok([{ type: "text" as const, text: "No incidents found." }]);
    }

    let text = `Found ${incidents.length} incident(s):\n\n`;
    for (const incident of incidents) {
      text += renderIncident(incident) + "\n";
    }

    return new Ok([{ type: "text" as const, text }]);
  },

  get_incident: async ({ incidentNumber }, { authInfo }) => {
    const credentialsResult = getServiceNowCredentials(authInfo);
    if (credentialsResult.isErr()) {
      return credentialsResult;
    }
    const { accessToken, instanceUrl } = credentialsResult.value;

    const result = await getIncidentByNumber(
      accessToken,
      instanceUrl,
      incidentNumber
    );

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Ok([
        {
          type: "text" as const,
          text: `No incident found with number ${incidentNumber}.`,
        },
      ]);
    }

    return new Ok([
      { type: "text" as const, text: renderIncident(result.value) },
    ]);
  },

  create_incident: async (params, { authInfo }) => {
    const credentialsResult = getServiceNowCredentials(authInfo);
    if (credentialsResult.isErr()) {
      return credentialsResult;
    }
    const { accessToken, instanceUrl } = credentialsResult.value;

    const result = await createIncident(
      accessToken,
      instanceUrl,
      writableFieldsFromParams(params)
    );

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

  update_incident: async ({ sysId, ...fields }, { authInfo }) => {
    const credentialsResult = getServiceNowCredentials(authInfo);
    if (credentialsResult.isErr()) {
      return credentialsResult;
    }
    const { accessToken, instanceUrl } = credentialsResult.value;

    const writableFields = writableFieldsFromParams(fields);

    if (Object.keys(writableFields).length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No fields to update were provided.",
        },
      ]);
    }

    const result = await updateIncident(
      accessToken,
      instanceUrl,
      sysId,
      writableFields
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
};

export const TOOLS = buildTools(SERVICENOW_TOOLS_METADATA, handlers);
