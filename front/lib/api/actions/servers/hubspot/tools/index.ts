import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  countObjectsByProperties,
  createAssociation,
  createCommunication,
  createCompany,
  createContact,
  createCustomObject,
  createDeal,
  createLead,
  createMeeting,
  createNote,
  createTask,
  createTicket,
  deleteTask,
  getAssociatedMeetings,
  getCurrentUserId,
  getEmailCampaign,
  getFilePublicUrl,
  getMarketingEmail,
  getMarketingEmailStatisticsHistogram,
  getMeeting,
  getObjectProperties,
  getUserActivity,
  getUserDetails,
  listAssociationLabels,
  listAssociations,
  listCustomObjectSchemas,
  listEmailCampaigns,
  listEmailEvents,
  listMarketingEmails,
  listOwners,
  MAX_COUNT_LIMIT,
  removeAssociation,
  searchCrmObjects,
  searchOwners,
  updateCompany,
  updateContact,
  updateCustomObject,
  updateDeal,
  updateTask,
} from "@app/lib/api/actions/servers/hubspot/client";
import {
  ERROR_MESSAGES,
  generateUrls,
  HUBSPOT_ID_TO_OBJECT_TYPE,
  validateRequests,
  withAuth,
} from "@app/lib/api/actions/servers/hubspot/helpers";
import { HUBSPOT_TOOLS_METADATA } from "@app/lib/api/actions/servers/hubspot/metadata";
import {
  formatHubSpotCreateSuccess,
  formatHubSpotSearchResponse,
  formatHubSpotUpdateSuccess,
  formatOwnersAsText,
  formatTransformedPropertiesAsText,
} from "@app/lib/api/actions/servers/hubspot/rendering";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof HUBSPOT_TOOLS_METADATA> = {
  get_object_properties: async (
    { objectType, creatableOnly = true },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getObjectProperties({
        accessToken,
        objectType,
        creatableOnly,
      });
      const formattedText = formatTransformedPropertiesAsText(
        result,
        objectType,
        creatableOnly
      );
      return new Ok([
        { type: "text" as const, text: formattedText },
        { type: "text" as const, text: "Properties retrieved successfully" },
      ]);
    });
  },

  list_custom_object_schemas: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const schemas = await listCustomObjectSchemas({ accessToken });
      if (!schemas.length) {
        return new Ok([
          {
            type: "text" as const,
            text: "No custom object schemas found in this HubSpot account.",
          },
        ]);
      }
      return new Ok([
        { type: "text" as const, text: JSON.stringify(schemas, null, 2) },
        {
          type: "text" as const,
          text: `Found ${schemas.length} custom object schema(s).`,
        },
      ]);
    });
  },

  list_owners: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const owners = await listOwners(accessToken);
      if (!owners.length) {
        return new Err(new MCPError("No owners found."));
      }
      return new Ok([
        { type: "text" as const, text: formatOwnersAsText(owners) },
        { type: "text" as const, text: "Owners retrieved successfully." },
      ]);
    });
  },

  search_owners: async ({ searchQuery }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const owners = await searchOwners(accessToken, searchQuery);
      if (!owners.length) {
        return new Err(
          new MCPError(`No owners found matching "${searchQuery}".`)
        );
      }
      return new Ok([
        { type: "text" as const, text: formatOwnersAsText(owners) },
        {
          type: "text" as const,
          text: `Found ${owners.length} owner(s) matching "${searchQuery}".`,
        },
      ]);
    });
  },

  count_objects_by_properties: async ({ objectType, filters }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const count = await countObjectsByProperties(
        accessToken,
        objectType,
        filters
      );
      if (!count) {
        return new Err(new MCPError(ERROR_MESSAGES.NO_OBJECTS_FOUND));
      }
      if (count >= MAX_COUNT_LIMIT) {
        return new Ok([
          { type: "text" as const, text: `${MAX_COUNT_LIMIT}+` },
          {
            type: "text" as const,
            text: `Found ${MAX_COUNT_LIMIT}+ ${objectType} matching the filters (exact count unavailable due to API limits)`,
          },
        ]);
      }
      return new Ok([
        { type: "text" as const, text: count.toString() },
        {
          type: "text" as const,
          text: `Found ${count} ${objectType} matching the specified filters`,
        },
      ]);
    });
  },

  get_meeting: async ({ meetingId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getMeeting(accessToken, meetingId);
      if (!result) {
        return new Err(
          new MCPError(
            ERROR_MESSAGES.OBJECT_NOT_FOUND + " Or it was not a meeting."
          )
        );
      }
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Meeting retrieved successfully." },
      ]);
    });
  },

  get_file_public_url: async ({ fileId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getFilePublicUrl(accessToken, fileId);
      if (!result) {
        return new Err(
          new MCPError("File not found or public URL not available.")
        );
      }
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify({ url: result }, null, 2),
        },
        {
          type: "text" as const,
          text: "File public URL retrieved successfully.",
        },
      ]);
    });
  },

  get_associated_meetings: async ({ fromObjectType, fromObjectId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getAssociatedMeetings(
        accessToken,
        fromObjectType,
        fromObjectId
      );
      if (result === null) {
        return new Err(new MCPError("Error retrieving associated meetings."));
      }
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: "Associated meetings retrieved successfully.",
        },
      ]);
    });
  },

  search_crm_objects: async (input, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await searchCrmObjects({
        accessToken,
        objectType: input.objectType,
        filters: input.filters,
        query: input.query,
        propertiesToReturn: input.propertiesToReturn,
        limit: input.limit,
        after: input.after,
      });
      if (!result) {
        return new Err(new MCPError("Search failed."));
      }

      const payload = formatHubSpotSearchResponse({
        objects: result.results,
        objectType: input.objectType,
        after: result.paging?.next?.after,
      });

      if (result.results.length === 0) {
        return new Ok([
          { type: "text" as const, text: JSON.stringify(payload, null, 2) },
          { type: "text" as const, text: "No results found." },
        ]);
      }

      const paginationNote = payload.paging
        ? ` More results available. Pass after="${payload.paging.after}" to fetch the next page.`
        : "";

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(payload, null, 2),
        },
        {
          type: "text" as const,
          text: `Found ${result.results.length} ${input.objectType}.${paginationNote}`,
        },
      ]);
    });
  },

  export_crm_objects_csv: async (input, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("Missing HubSpot access token"));
    }

    // Hard cap for safety
    const HARD_ROW_LIMIT = 2000;
    const maxRows = Math.min(input.maxRows ?? HARD_ROW_LIMIT, HARD_ROW_LIMIT);
    let after: string | undefined = undefined;
    let totalFetched = 0;
    const allResults: any[] = [];
    try {
      // Paginate through results
      while (totalFetched < maxRows) {
        const pageLimit = Math.min(100, maxRows - totalFetched); // HubSpot API max page size is 100
        const result = await searchCrmObjects({
          accessToken: token,
          objectType: input.objectType,
          filters: input.filters,
          query: input.query,
          propertiesToReturn: input.propertiesToExport,
          limit: pageLimit,
          after,
        });
        if (!result || !result.results.length) {
          break;
        }
        allResults.push(...result.results);
        totalFetched += result.results.length;
        after = result.paging?.next?.after;
        if (!after) {
          break;
        }
      }
    } catch (err) {
      return new Err(
        new MCPError(
          `Failed to fetch objects from HubSpot: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    if (!allResults.length) {
      return new Ok([
        { type: "text" as const, text: "No objects found for export." },
      ]);
    }
    // Convert to CSVRecord[]
    const csvRows = allResults.map((obj) => {
      const row: Record<string, string | number | boolean | null | undefined> =
        {};
      for (const prop of input.propertiesToExport) {
        row[prop] = obj.properties?.[prop] ?? obj[prop] ?? null;
      }
      // Always include id if present
      if (obj.id && !row.id) {
        row.id = obj.id;
      }
      return row;
    });
    // Return CSV data as text
    const csvHeader = input.propertiesToExport.join(",");
    const csvContent = csvRows
      .map((row) =>
        input.propertiesToExport
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          .map((prop) => `"${String(row[prop] || "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const fullCsv = `${csvHeader}\n${csvContent}`;

    return new Ok([
      { type: "text" as const, text: fullCsv },
      {
        type: "text" as const,
        text: `Exported ${csvRows.length} ${input.objectType} to CSV`,
      },
    ]);
  },

  get_hubspot_link: async ({ portalId, uiDomain, pageRequests }, _extra) => {
    const validationResult = validateRequests(pageRequests);
    if (validationResult.errors.length > 0) {
      const errorResponse = {
        errors: [...validationResult.errors],
      };

      // Add valid object type IDs only if there were invalid IDs that couldn't be converted
      if (validationResult.invalidObjectTypeIds.length > 0) {
        const validObjectTypes = Object.keys(HUBSPOT_ID_TO_OBJECT_TYPE)
          .map((id) => {
            const objectType = (
              HUBSPOT_ID_TO_OBJECT_TYPE as Record<string, string>
            )[id];
            return `${objectType} (${id})`;
          })
          .join(", ");
        errorResponse.errors.push(
          `Valid object types and IDs: ${validObjectTypes}`
        );
      }

      return new Err(new MCPError(JSON.stringify(errorResponse, null, 2)));
    }
    const urlResults = generateUrls(portalId, uiDomain, pageRequests);

    return new Ok([
      { type: "text" as const, text: JSON.stringify(urlResults, null, 2) },
      { type: "text" as const, text: "HubSpot links generated successfully." },
    ]);
  },

  get_hubspot_portal_id: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getUserDetails(accessToken);
      return new Ok([
        {
          type: "text" as const,
          text: `Portal ID: ${result.hub_id}\nUI Domain: app.hubspot.com`,
        },
        {
          type: "text" as const,
          text: "Portal information retrieved successfully",
        },
      ]);
    });
  },

  list_associations: async ({ objectType, objectId, toObjectType }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listAssociations({
        accessToken,
        objectType,
        objectId,
        toObjectType,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Associations retrieved successfully for ${objectType}:${objectId}`,
        },
      ]);
    });
  },

  list_association_labels: async ({ fromObjectType, toObjectType }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listAssociationLabels({
        accessToken,
        fromObjectType,
        toObjectType,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Association labels retrieved successfully between ${fromObjectType} and ${toObjectType}`,
        },
      ]);
    });
  },

  get_current_user_id: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getCurrentUserId(accessToken);
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: "Current user information retrieved successfully",
        },
      ]);
    });
  },

  get_user_activity: async ({ ownerId, startDate, endDate, limit }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getUserActivity({
        accessToken,
        ownerId,
        startDate,
        endDate,
        limit,
      });

      if (!result.results || result.results.length === 0) {
        return new Ok([
          {
            type: "text" as const,
            text: `No activities found for the specified period. Summary: ${JSON.stringify(result.summary, null, 2)}`,
          },
          {
            type: "text" as const,
            text: `No activities found for owner ${ownerId} between ${startDate} and ${endDate}`,
          },
        ]);
      }

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              activities: result.results,
              summary: result.summary,
            },
            null,
            2
          ),
        },
        {
          type: "text" as const,
          text: `Found ${result.results.length} activities for owner ${ownerId} between ${startDate} and ${endDate}`,
        },
      ]);
    });
  },

  // Marketing email operations
  list_marketing_emails: async ({ limit, after, state }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listMarketingEmails({
        accessToken,
        limit,
        after,
        state,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Found ${result.total} marketing email(s).`,
        },
      ]);
    });
  },

  get_marketing_email: async ({ emailId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getMarketingEmail({ accessToken, emailId });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: "Marketing email retrieved successfully.",
        },
      ]);
    });
  },

  get_marketing_email_statistics: async ({ emailId, interval }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getMarketingEmailStatisticsHistogram({
        accessToken,
        emailId,
        interval,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: "Marketing email statistics retrieved successfully.",
        },
      ]);
    });
  },

  list_email_events: async (
    { limit, offset, eventType, campaignId, startTimestamp, endTimestamp },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listEmailEvents({
        accessToken,
        limit,
        offset,
        eventType,
        campaignId,
        startTimestamp,
        endTimestamp,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Retrieved ${result.events.length} email event(s).`,
        },
      ]);
    });
  },

  list_email_campaigns: async ({ limit, offset }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listEmailCampaigns({
        accessToken,
        limit,
        offset,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Retrieved ${result.campaigns.length} email campaign(s).`,
        },
      ]);
    });
  },

  get_email_campaign: async ({ campaignId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getEmailCampaign({ accessToken, campaignId });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: "Email campaign retrieved successfully.",
        },
      ]);
    });
  },

  // Create operations
  create_contact: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createContact({
        accessToken,
        properties,
        associations,
      });
      const formatted = formatHubSpotCreateSuccess(result, "contacts");
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
        { type: "text" as const, text: formatted.message },
      ]);
    });
  },

  create_company: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createCompany({
        accessToken,
        properties,
        associations,
      });
      const formatted = formatHubSpotCreateSuccess(result, "companies");
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
        { type: "text" as const, text: formatted.message },
      ]);
    });
  },

  create_deal: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createDeal({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Deal created successfully." },
      ]);
    });
  },

  create_ticket: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createTicket({
        accessToken,
        properties,
        associations,
      });
      const formatted = formatHubSpotCreateSuccess(result, "tickets");
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
        { type: "text" as const, text: formatted.message },
      ]);
    });
  },

  create_lead: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createLead({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Lead created successfully." },
      ]);
    });
  },

  create_task: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createTask({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Task created successfully." },
      ]);
    });
  },

  create_note: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createNote({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Note created successfully." },
      ]);
    });
  },

  create_communication: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createCommunication({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Communication (channel: ${properties.hs_communication_channel_type || "unknown"}) created successfully.`,
        },
      ]);
    });
  },

  create_meeting: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createMeeting({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Meeting created successfully." },
      ]);
    });
  },

  create_custom_object: async (
    { objectType, properties, associations },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createCustomObject({
        accessToken,
        objectType,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Custom object (${objectType}) created successfully.`,
        },
      ]);
    });
  },

  create_association: async (
    {
      fromObjectType,
      fromObjectId,
      toObjectType,
      toObjectId,
      associationCategory,
      associationTypeId,
    },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createAssociation({
        accessToken,
        fromObjectType,
        fromObjectId,
        toObjectType,
        toObjectId,
        associationCategory,
        associationTypeId,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Association created successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
        },
      ]);
    });
  },

  // Update operations
  update_contact: async ({ contactId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateContact({
        accessToken,
        contactId,
        properties,
      });
      const formatted = formatHubSpotUpdateSuccess(result, "contacts");
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
        { type: "text" as const, text: formatted.message },
      ]);
    });
  },

  update_company: async ({ companyId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateCompany({
        accessToken,
        companyId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Company updated successfully." },
      ]);
    });
  },

  update_deal: async ({ dealId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateDeal({
        accessToken,
        dealId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Deal updated successfully." },
      ]);
    });
  },

  update_custom_object: async ({ objectType, objectId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateCustomObject({
        accessToken,
        objectType,
        objectId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        {
          type: "text" as const,
          text: `Custom object (${objectType}) updated successfully.`,
        },
      ]);
    });
  },

  update_task: async ({ taskId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateTask({
        accessToken,
        taskId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Task updated successfully." },
      ]);
    });
  },

  complete_task: async ({ taskId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateTask({
        accessToken,
        taskId,
        properties: { hs_task_status: "COMPLETED" },
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
        { type: "text" as const, text: "Task marked as completed." },
      ]);
    });
  },

  delete_task: async ({ taskId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      await deleteTask({
        accessToken,
        taskId,
      });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify({ success: true }, null, 2),
        },
        {
          type: "text" as const,
          text: `Task ${taskId} deleted successfully.`,
        },
      ]);
    });
  },

  remove_association: async (
    { fromObjectType, fromObjectId, toObjectType, toObjectId },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      await removeAssociation({
        accessToken,
        fromObjectType,
        fromObjectId,
        toObjectType,
        toObjectId,
      });
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify({ success: true }, null, 2),
        },
        {
          type: "text" as const,
          text: `Association removed successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
        },
      ]);
    });
  },
};

export const TOOLS = buildTools(HUBSPOT_TOOLS_METADATA, handlers);
