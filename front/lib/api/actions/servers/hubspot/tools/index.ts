import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  countObjectsByProperties,
  createAssociation,
  createCommunication,
  createCompany,
  createContact,
  createDeal,
  createLead,
  createMeeting,
  createNote,
  createTask,
  getAssociatedMeetings,
  getCompany,
  getContact,
  getCurrentUserId,
  getDeal,
  getFilePublicUrl,
  getLatestObjects,
  getMeeting,
  getObjectByEmail,
  getObjectProperties,
  getUserActivity,
  getUserDetails,
  listAssociations,
  listOwners,
  MAX_COUNT_LIMIT,
  MAX_LIMIT,
  removeAssociation,
  searchCrmObjects,
  searchOwners,
  updateCompany,
  updateContact,
  updateDeal,
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
  formatHubSpotGetSuccess,
  formatHubSpotObjectsAsText,
  formatHubSpotSearchResults,
  formatHubSpotUpdateSuccess,
  formatTransformedPropertiesAsText,
} from "@app/lib/api/actions/servers/hubspot/rendering";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof HUBSPOT_TOOLS_METADATA> = {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
        { type: "text" as const, text: "Properties retrieved successfully" },
        { type: "text" as const, text: formattedText },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_object_by_email: async ({ objectType, email }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const object = await getObjectByEmail(accessToken, objectType, email);
      if (!object) {
        return new Err(new MCPError(ERROR_MESSAGES.OBJECT_NOT_FOUND));
      }
      // Handle different object types properly
      if ("email" in object) {
        // This is a SimplePublicObject
        const formatted = formatHubSpotGetSuccess(object as any, objectType);
        return new Ok([
          { type: "text" as const, text: formatted.message },
          {
            type: "text" as const,
            text: JSON.stringify(formatted.result, null, 2),
          },
        ]);
      } else {
        // This is a PublicOwner - return simpler format
        const owner = object as any;
        return new Ok([
          {
            type: "text" as const,
            text: `${objectType.slice(0, -1)} retrieved successfully`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: owner.id,
                email: owner.email,
                firstName: owner.firstName,
                lastName: owner.lastName,
              },
              null,
              2
            ),
          },
        ]);
      }
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  list_owners: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const owners = await listOwners(accessToken);
      if (!owners.length) {
        return new Err(new MCPError("No owners found."));
      }
      return new Ok([
        { type: "text" as const, text: "Owners retrieved successfully." },
        { type: "text" as const, text: JSON.stringify(owners, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  search_owners: async ({ searchQuery }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const owners = await searchOwners(accessToken, searchQuery);
      if (!owners.length) {
        return new Err(
          new MCPError(`No owners found matching "${searchQuery}".`)
        );
      }
      return new Ok([
        {
          type: "text" as const,
          text: `Found ${owners.length} owner(s) matching "${searchQuery}".`,
        },
        { type: "text" as const, text: JSON.stringify(owners, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
          {
            type: "text" as const,
            text: `Found ${MAX_COUNT_LIMIT}+ ${objectType} matching the filters (exact count unavailable due to API limits)`,
          },
          { type: "text" as const, text: `${MAX_COUNT_LIMIT}+` },
        ]);
      }
      return new Ok([
        {
          type: "text" as const,
          text: `Found ${count} ${objectType} matching the specified filters`,
        },
        { type: "text" as const, text: count.toString() },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_latest_objects: async ({ objectType, limit = MAX_LIMIT }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const objects = await getLatestObjects(accessToken, objectType, limit);
      if (!objects.length) {
        return new Err(new MCPError(ERROR_MESSAGES.NO_OBJECTS_FOUND));
      }
      const formattedText = formatHubSpotObjectsAsText(objects, objectType);
      return new Ok([
        {
          type: "text" as const,
          text: "Latest objects retrieved successfully",
        },
        { type: "text" as const, text: formattedText },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_contact: async ({ contactId }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getContact(accessToken, contactId);
      if (!result) {
        return new Err(new MCPError(ERROR_MESSAGES.OBJECT_NOT_FOUND));
      }
      const formatted = formatHubSpotGetSuccess(result, "contacts");
      return new Ok([
        { type: "text" as const, text: formatted.message },
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_company: async ({ companyId, extraProperties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getCompany(accessToken, companyId, extraProperties);
      if (!result) {
        return new Err(new MCPError(ERROR_MESSAGES.OBJECT_NOT_FOUND));
      }
      const formatted = formatHubSpotGetSuccess(result, "companies");
      return new Ok([
        { type: "text" as const, text: formatted.message },
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_deal: async ({ dealId, extraProperties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getDeal(accessToken, dealId, extraProperties);
      if (!result) {
        return new Err(new MCPError(ERROR_MESSAGES.OBJECT_NOT_FOUND));
      }
      return new Ok([
        { type: "text" as const, text: "Deal retrieved successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
        { type: "text" as const, text: "Meeting retrieved successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
          text: "File public URL retrieved successfully.",
        },
        {
          type: "text" as const,
          text: JSON.stringify({ url: result }, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
        {
          type: "text" as const,
          text: "Associated meetings retrieved successfully.",
        },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
      if (result.results.length === 0) {
        return new Ok([{ type: "text" as const, text: "No results found." }]);
      }

      const searchResults = formatHubSpotSearchResults(
        result.results,
        input.objectType
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(searchResults, null, 2),
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
      {
        type: "text" as const,
        text: `Exported ${csvRows.length} ${input.objectType} to CSV`,
      },
      { type: "text" as const, text: fullCsv },
    ]);
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
      { type: "text" as const, text: "HubSpot links generated successfully." },
      { type: "text" as const, text: JSON.stringify(urlResults, null, 2) },
    ]);
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_hubspot_portal_id: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getUserDetails(accessToken);
      return new Ok([
        {
          type: "text" as const,
          text: "Portal information retrieved successfully",
        },
        {
          type: "text" as const,
          text: `Portal ID: ${result.hub_id}\nUI Domain: app.hubspot.com`,
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  list_associations: async ({ objectType, objectId, toObjectType }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await listAssociations({
        accessToken,
        objectType,
        objectId,
        toObjectType,
      });
      return new Ok([
        {
          type: "text" as const,
          text: `Associations retrieved successfully for ${objectType}:${objectId}`,
        },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_current_user_id: async (_params, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await getCurrentUserId(accessToken);
      return new Ok([
        {
          type: "text" as const,
          text: "Current user information retrieved successfully",
        },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
            text: `No activities found for owner ${ownerId} between ${startDate} and ${endDate}`,
          },
          {
            type: "text" as const,
            text: `No activities found for the specified period. Summary: ${JSON.stringify(result.summary, null, 2)}`,
          },
        ]);
      }

      return new Ok([
        {
          type: "text" as const,
          text: `Found ${result.results.length} activities for owner ${ownerId} between ${startDate} and ${endDate}`,
        },
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
      ]);
    });
  },

  // Create operations
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    create_contact: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createContact({
        accessToken,
        properties,
        associations,
      });
      const formatted = formatHubSpotCreateSuccess(result, "contacts");
      return new Ok([
        { type: "text" as const, text: formatted.message },
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_company: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createCompany({
        accessToken,
        properties,
        associations,
      });
      const formatted = formatHubSpotCreateSuccess(result, "companies");
      return new Ok([
        { type: "text" as const, text: formatted.message },
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_deal: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createDeal({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: "Deal created successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_lead: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createLead({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: "Lead (as Deal) created successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_task: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createTask({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: "Task created successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_note: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createNote({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: "Note created successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_communication: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createCommunication({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Communication (channel: ${properties.hs_communication_channel_type || "unknown"}) created successfully.`,
        },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_meeting: async ({ properties, associations }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createMeeting({
        accessToken,
        properties,
        associations,
      });
      return new Ok([
        { type: "text" as const, text: "Meeting created successfully." },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_association: async (
    { fromObjectType, fromObjectId, toObjectType, toObjectId },
    extra
  ) => {
    return withAuth(extra, async (accessToken) => {
      const result = await createAssociation({
        accessToken,
        fromObjectType,
        fromObjectId,
        toObjectType,
        toObjectId,
      });
      return new Ok([
        {
          type: "text" as const,
          text: `Association created successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
        },
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // Update operations
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    update_contact: async ({ contactId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateContact({
        accessToken,
        contactId,
        properties,
      });
      const formatted = formatHubSpotUpdateSuccess(result, "contacts");
      return new Ok([
        { type: "text" as const, text: formatted.message },
        {
          type: "text" as const,
          text: JSON.stringify(formatted.result, null, 2),
        },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  update_company: async ({ companyId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateCompany({
        accessToken,
        companyId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  update_deal: async ({ dealId, properties }, extra) => {
    return withAuth(extra, async (accessToken) => {
      const result = await updateDeal({
        accessToken,
        dealId,
        properties,
      });
      return new Ok([
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ]);
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
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
          text: `Association removed successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
        },
        {
          type: "text" as const,
          text: JSON.stringify({ success: true }, null, 2),
        },
      ]);
    });
  },
};

export const TOOLS = buildTools(HUBSPOT_TOOLS_METADATA, handlers);
