import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  ALL_OBJECTS,
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
  SIMPLE_OBJECTS,
  updateCompany,
  updateContact,
  updateDeal,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_api_helper";
import {
  formatHubSpotCreateSuccess,
  formatHubSpotGetSuccess,
  formatHubSpotObjectsAsText,
  formatHubSpotSearchResults,
  formatHubSpotUpdateSuccess,
  formatTransformedPropertiesAsText,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_response_helpers";
import { HUBSPOT_ID_TO_OBJECT_TYPE } from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_utils";
import {
  ERROR_MESSAGES,
  generateUrls,
  validateRequests,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_utils";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("hubspot");

  server.tool(
    "get_object_properties",
    "Lists all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    {
      objectType: z.enum(ALL_OBJECTS),
      creatableOnly: z.boolean().optional(),
    },
    async ({ objectType, creatableOnly = true }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
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
          return makeMCPToolTextSuccess({
            message: "Properties retrieved successfully",
            result: formattedText,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_contact",
    "Creates a new contact in Hubspot, with optional associations.",
    {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the contact."),
      associations: z
        .array(
          z.object({
            toObjectId: z.string(),
            toObjectType: z.string().describe("e.g., companies, deals"),
          })
        )
        .optional()
        .describe("Optional array of associations to create."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createContact({
            accessToken,
            properties,
            associations,
          });
          const formatted = formatHubSpotCreateSuccess(result, "contacts");
          return makeMCPToolJSONSuccess(formatted);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_object_by_email",
    `Retrieves a Hubspot object using an email address. Supports ${ALL_OBJECTS.join(", ")}.`,
    {
      objectType: z.enum(ALL_OBJECTS),
      email: z.string().describe("The email address of the object."),
    },
    async ({ objectType, email }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const object = await getObjectByEmail(accessToken, objectType, email);
          if (!object) {
            return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
          }
          // Handle different object types properly
          if ("email" in object) {
            // This is a SimplePublicObject
            const formatted = formatHubSpotGetSuccess(
              object as any,
              objectType
            );
            return makeMCPToolJSONSuccess(formatted);
          } else {
            // This is a PublicOwner - return simpler format
            const owner = object as any;
            return makeMCPToolJSONSuccess({
              message: `${objectType.slice(0, -1)} retrieved successfully`,
              result: {
                id: owner.id,
                email: owner.email,
                firstName: owner.firstName,
                lastName: owner.lastName,
              },
            });
          }
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_owners",
    "Lists all owners (users) in the HubSpot account with their IDs, names, and email addresses. " +
      "Use this to find owner IDs for get_user_activity calls when you want to get activity for other users. " +
      "For your own activity, use get_current_user_id instead.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const owners = await listOwners(accessToken);
          if (!owners.length) {
            return makeMCPToolTextError("No owners found.");
          }
          return makeMCPToolJSONSuccess({
            message: "Owners retrieved successfully.",
            result: owners,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "search_owners",
    "Searches for specific owners (users) in the HubSpot account by email, name, ID, or user ID. " +
      "Supports partial matching for names and emails, and exact matching for IDs. " +
      "Use this to find owner information when you have partial details about a user.",
    {
      searchQuery: z
        .string()
        .describe(
          "The search query - can be email, first name, last name, full name, owner ID, or user ID"
        ),
    },
    async ({ searchQuery }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const owners = await searchOwners(accessToken, searchQuery);
          if (!owners.length) {
            return makeMCPToolTextError(
              `No owners found matching "${searchQuery}".`
            );
          }
          return makeMCPToolJSONSuccess({
            message: `Found ${owners.length} owner(s) matching "${searchQuery}".`,
            result: owners,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "count_objects_by_properties",
    `Count objects in Hubspot with matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_COUNT_LIMIT} objects.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      filters: z
        .array(
          z.object({
            propertyName: z
              .string()
              .describe("The name of the property to search by."),
            operator: z
              .nativeEnum(FilterOperatorEnum)
              .describe("The operator to use for comparison."),
            value: z
              .string()
              .optional()
              .describe("The value to compare against"),
            values: z
              .array(z.string())
              .optional()
              .describe(
                "The values to compare against. Required for IN/NOT_IN operators."
              ),
          })
        )
        .describe("Array of property filters to apply."),
    },
    async ({ objectType, filters }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const count = await countObjectsByProperties(
            accessToken,
            objectType,
            filters
          );
          if (!count) {
            return makeMCPToolTextError(ERROR_MESSAGES.NO_OBJECTS_FOUND);
          }
          if (count >= MAX_COUNT_LIMIT) {
            return makeMCPToolTextSuccess({
              message: `Found ${MAX_COUNT_LIMIT}+ ${objectType} matching the filters (exact count unavailable due to API limits)`,
              result: `${MAX_COUNT_LIMIT}+`,
            });
          }
          return makeMCPToolTextSuccess({
            message: `Found ${count} ${objectType} matching the specified filters`,
            result: count.toString(),
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_latest_objects",
    `Get latest objects from Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}. Limit is ${MAX_LIMIT}.`,
    {
      objectType: z.enum(SIMPLE_OBJECTS),
      limit: z.number().optional(),
    },
    async ({ objectType, limit = MAX_LIMIT }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const objects = await getLatestObjects(
            accessToken,
            objectType,
            limit
          );
          if (!objects.length) {
            return makeMCPToolTextError(ERROR_MESSAGES.NO_OBJECTS_FOUND);
          }
          const formattedText = formatHubSpotObjectsAsText(objects, objectType);
          return makeMCPToolTextSuccess({
            message: "Latest objects retrieved successfully",
            result: formattedText,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_company",
    "Creates a new company in Hubspot, with optional associations.",
    {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the company."),
      associations: z
        .array(
          z.object({
            toObjectId: z.string(),
            toObjectType: z.string().describe("e.g., contacts, deals"),
          })
        )
        .optional()
        .describe("Optional array of associations to create."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createCompany({
            accessToken,
            properties,
            associations,
          });
          const formatted = formatHubSpotCreateSuccess(result, "companies");
          return makeMCPToolJSONSuccess(formatted);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_deal",
    "Creates a new deal in Hubspot, with optional associations.",
    {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the deal."),
      associations: z
        .array(
          z.object({
            toObjectId: z.string(),
            toObjectType: z.string().describe("e.g., contacts, companies"),
          })
        )
        .optional()
        .describe("Optional array of associations to create."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createDeal({
            accessToken,
            properties,
            associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Deal created successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_lead",
    "Creates a new lead in Hubspot (as a Deal), with optional associations. Ensure properties correctly define it as a lead.",
    {
      properties: z
        .record(z.string())
        .describe(
          "Properties for the lead (deal), including those that identify it as a lead."
        ),
      associations: z
        .array(
          z.object({
            toObjectId: z.string(),
            toObjectType: z.string().describe("e.g., contacts, companies"),
          })
        )
        .optional()
        .describe("Optional array of associations to create."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createLead({
            accessToken,
            properties,
            associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Lead (as Deal) created successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_task",
    "Creates a new task in Hubspot, with optional associations.",
    {
      properties: z
        .record(z.string())
        .describe(
          "Properties for the task (e.g., hs_task_subject, hs_task_body, hs_timestamp, hs_task_status, hs_task_priority)."
        ),
      associations: z
        .array(
          z.object({
            toObjectId: z.string(),
            toObjectType: z
              .string()
              .describe("e.g., contacts, companies, deals"),
          })
        )
        .optional()
        .describe("Optional array of associations to create."),
    },
    async (input, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createTask({
            accessToken,
            properties: input.properties,
            associations: input.associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Task created successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_note",
    "Creates a new note in Hubspot, with optional associations.",
    {
      properties: z
        .object({
          hs_note_body: z.string().describe("The content of the note."),
          hs_timestamp: z
            .string()
            .optional()
            .describe(
              "The timestamp of the note (ISO 8601 format). Defaults to current time if not provided."
            ),
        })
        .describe("Properties for the note."),
      associations: z
        .object({
          contactIds: z.array(z.string()).optional(),
          companyIds: z.array(z.string()).optional(),
          dealIds: z.array(z.string()).optional(),
          ownerIds: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Direct IDs of objects to associate the note with."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createNote({
            accessToken,
            properties,
            associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Note created successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_communication",
    "Creates a new communication (WhatsApp, LinkedIn, SMS) in Hubspot as an engagement. Requires hs_communication_channel_type in properties.",
    {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_engagement_type (e.g., 'COMMUNICATION'), hs_communication_channel_type, and message content (e.g., hs_communication_body)."
        ),
      associations: z
        .object({
          contactIds: z.array(z.string()).optional(),
          companyIds: z.array(z.string()).optional(),
          dealIds: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Direct IDs of objects to associate the communication with."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createCommunication({
            accessToken,
            properties,
            associations,
          });
          return makeMCPToolJSONSuccess({
            message: `Communication (channel: ${properties.hs_communication_channel_type || "unknown"}) created successfully.`,
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_meeting",
    "Creates a new meeting in Hubspot as an engagement. Ensure hs_engagement_type='MEETING' and meeting details are in properties.",
    {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_engagement_type='MEETING', hs_meeting_title, hs_meeting_start_time, etc."
        ),
      associations: z
        .object({
          contactIds: z.array(z.string()).optional(),
          companyIds: z.array(z.string()).optional(),
          dealIds: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Direct IDs of objects to associate the meeting with."),
    },
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createMeeting({
            accessToken,
            properties,
            associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Meeting created successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  // Definition for getContact tool
  server.tool(
    "get_contact",
    "Retrieves a Hubspot contact by its ID.",
    {
      contactId: z.string().describe("The ID of the contact to retrieve."),
    },
    async ({ contactId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getContact(accessToken, contactId);
          if (!result) {
            return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
          }
          const formatted = formatHubSpotGetSuccess(result, "contacts");
          return makeMCPToolJSONSuccess(formatted);
        },
        authInfo,
      });
    }
  );

  // Definition for getCompany tool
  server.tool(
    "get_company",
    "Retrieves a Hubspot company by its ID.",
    {
      companyId: z.string().describe("The ID of the company to retrieve."),
    },
    async ({ companyId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getCompany(accessToken, companyId);
          if (!result) {
            return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
          }
          const formatted = formatHubSpotGetSuccess(result, "companies");
          return makeMCPToolJSONSuccess(formatted);
        },
        authInfo,
      });
    }
  );

  // Definition for getDeal tool
  server.tool(
    "get_deal",
    "Retrieves a Hubspot deal by its ID.",
    {
      dealId: z.string().describe("The ID of the deal to retrieve."),
    },
    async ({ dealId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getDeal(accessToken, dealId);
          if (!result) {
            return makeMCPToolTextError(ERROR_MESSAGES.OBJECT_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Deal retrieved successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  // Definition for getMeeting tool
  server.tool(
    "get_meeting",
    "Retrieves a Hubspot meeting (engagement) by its ID.",
    {
      meetingId: z
        .string()
        .describe("The ID of the meeting (engagement) to retrieve."),
    },
    async ({ meetingId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getMeeting(accessToken, meetingId);
          if (!result) {
            return makeMCPToolTextError(
              ERROR_MESSAGES.OBJECT_NOT_FOUND + " Or it was not a meeting."
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Meeting retrieved successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  // Definition for getFilePublicUrl tool
  server.tool(
    "get_file_public_url",
    "Retrieves a publicly available URL for a file in HubSpot.",
    {
      fileId: z.string().describe("The ID of the file."),
    },
    async ({ fileId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getFilePublicUrl(accessToken, fileId);
          if (!result) {
            return makeMCPToolTextError(
              "File not found or public URL not available."
            );
          }
          return makeMCPToolJSONSuccess({
            message: "File public URL retrieved successfully.",
            result: { url: result }, // Return as an object for consistency
          });
        },
        authInfo,
      });
    }
  );

  // Definition for getAssociatedMeetings tool
  server.tool(
    "get_associated_meetings",
    "Retrieves meetings associated with a specific object (contact, company, or deal).",
    {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the object (contacts, companies, or deals)."),
      fromObjectId: z.string().describe("The ID of the object."),
    },
    async ({ fromObjectType, fromObjectId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getAssociatedMeetings(
            accessToken,
            fromObjectType,
            fromObjectId
          );
          if (result === null) {
            return makeMCPToolTextError(
              "Error retrieving associated meetings."
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Associated meetings retrieved successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  // Definition for searchCrmObjects tool
  const searchableObjectTypes = z.enum([
    "contacts",
    "companies",
    "deals",
    "tasks",
    "notes",
    "meetings",
    "calls",
    "emails",
    "products",
    "line_items",
    "quotes",
    "feedback_submissions",
  ]); // Add other searchable types as needed

  server.tool(
    "update_contact",
    "Updates properties of a HubSpot contact by ID.",
    {
      contactId: z.string().describe("The ID of the contact to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    async ({ contactId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateContact({
            accessToken,
            contactId,
            properties,
          });
          const formatted = formatHubSpotUpdateSuccess(result, "contacts");
          return makeMCPToolJSONSuccess(formatted);
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_company",
    "Updates properties of a HubSpot company by ID.",
    {
      companyId: z.string().describe("The ID of the company to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    async ({ companyId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateCompany({
            accessToken,
            companyId,
            properties,
          });
          return makeMCPToolJSONSuccess({
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_deal",
    "Updates properties of a HubSpot deal by ID.",
    {
      dealId: z.string().describe("The ID of the deal to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    async ({ dealId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateDeal({
            accessToken,
            dealId,
            properties,
          });
          return makeMCPToolJSONSuccess({
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "search_crm_objects",
    "Comprehensive search tool for ALL HubSpot object types including contacts, companies, deals, " +
      "and ALL engagement types (tasks, notes, meetings, calls, emails). Supports advanced filtering by properties, " +
      "date ranges, owners, and free-text queries. Enhanced to support owner filtering across all engagement types. " +
      "IMPORTANT: For enumeration properties (like industry), always use get_object_properties first to discover the exact values. " +
      "Use this for specific searches, or use get_user_activity for comprehensive user activity across all types.",
    {
      objectType: searchableObjectTypes,
      filters: z
        .array(
          z.object({
            propertyName: z.string(),
            operator: z.nativeEnum(FilterOperatorEnum),
            value: z.string().optional(),
            values: z.array(z.string()).optional(),
          })
        )
        .optional()
        .describe("Array of property filters."),
      query: z.string().optional().describe("Free-text query string."),
      propertiesToReturn: z
        .array(z.string())
        .optional()
        .describe("Specific properties to return."),
      limit: z.number().optional().default(MAX_LIMIT),
      after: z.string().optional().describe("Pagination cursor."),
    },
    async (input, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await searchCrmObjects({
            accessToken,
            objectType: input.objectType,
            filters: input.filters,
            query: input.query,
            propertiesToReturn: input.propertiesToReturn,
            limit: input.limit,
            after: input.after,
          });
          if (!result || result.results.length === 0) {
            return makeMCPToolTextError(
              "Search failed or returned no results."
            );
          }

          const searchResults = formatHubSpotSearchResults(
            result.results,
            input.objectType
          );

          return {
            isError: false,
            content: [
              {
                type: "text",
                text: JSON.stringify(searchResults, null, 2),
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "export_crm_objects_csv",
    "Exports CRM objects of a given type to CSV, with filters, property selection, and row limits. The resulting file is available for table queries.",
    {
      objectType: searchableObjectTypes,
      propertiesToExport: z
        .array(z.string())
        .min(1)
        .describe("Properties to include in the CSV."),
      filters: z
        .array(
          z.object({
            propertyName: z.string(),
            operator: z.nativeEnum(FilterOperatorEnum),
            value: z.string().optional(),
            values: z.array(z.string()).optional(),
          })
        )
        .optional(),
      query: z.string().optional().describe("Free-text query string."),
      maxRows: z
        .number()
        .optional()
        .default(2000)
        .describe("Maximum number of rows to export (hard limit: 2000)."),
    },
    async (input, { authInfo }) => {
      // Hard cap for safety
      const HARD_ROW_LIMIT = 2000;
      const maxRows = Math.min(input.maxRows ?? HARD_ROW_LIMIT, HARD_ROW_LIMIT);
      let after: string | undefined = undefined;
      let totalFetched = 0;
      const allResults: any[] = [];
      try {
        // Guard clause for access token
        if (!authInfo?.token) {
          throw new Error("Missing HubSpot access token");
        }
        // Paginate through results
        while (totalFetched < maxRows) {
          const pageLimit = Math.min(100, maxRows - totalFetched); // HubSpot API max page size is 100
          const result = await searchCrmObjects({
            accessToken: authInfo.token,
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
        return makeMCPToolTextError(
          `Failed to fetch objects from HubSpot: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      if (!allResults.length) {
        return makeMCPToolTextError("No objects found for export.");
      }
      // Convert to CSVRecord[]
      const csvRows = allResults.map((obj) => {
        const row: Record<
          string,
          string | number | boolean | null | undefined
        > = {};
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

      return makeMCPToolTextSuccess({
        message: `Exported ${csvRows.length} ${input.objectType} to CSV`,
        result: fullCsv,
      });
    }
  );

  server.tool(
    "get_hubspot_link",
    "Purpose: Generates HubSpot UI links for different pages based on object types and IDs. " +
      "Supports both index pages (lists of objects) and record pages (specific object details). " +
      "Prerequisites: Use the hubspot-get-portal-id tool to get the PortalId and UiDomain. " +
      "Usage Guidance: Use to generate links to HubSpot UI pages when users need to reference specific HubSpot records. " +
      "Validates that object type IDs exist in the HubSpot system.",
    {
      portalId: z.string().describe("The HubSpot portal/account ID"),
      uiDomain: z.string().describe("The HubSpot UI domain"),
      pageRequests: z.array(
        z.object({
          pagetype: z.enum(["record", "index"]),
          objectTypeId: z.string(),
          objectId: z.string().optional(),
        })
      ),
    },
    async ({ portalId, uiDomain, pageRequests }) => {
      const validationResult = validateRequests(pageRequests);
      if (validationResult.errors.length > 0) {
        const errorResponse = {
          errors: validationResult.errors,
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

        return makeMCPToolTextError(JSON.stringify(errorResponse, null, 2));
      }
      const urlResults = generateUrls(portalId, uiDomain, pageRequests);

      return makeMCPToolJSONSuccess({
        message: "HubSpot links generated successfully.",
        result: urlResults,
      });
    }
  );

  server.tool(
    "get_hubspot_portal_id",
    "Gets the current user's portal ID. To use before calling get_hubspot_link",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getUserDetails(accessToken);
          return makeMCPToolTextSuccess({
            message: "Portal information retrieved successfully",
            result: `Portal ID: ${result.hub_id}\nUI Domain: app.hubspot.com`,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_association",
    "Creates an association between two existing HubSpot objects (e.g., associate a contact with a company).",
    {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      fromObjectId: z.string().describe("The ID of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
      toObjectId: z.string().describe("The ID of the target object"),
    },
    async (
      { fromObjectType, fromObjectId, toObjectType, toObjectId },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createAssociation({
            accessToken,
            fromObjectType,
            fromObjectId,
            toObjectType,
            toObjectId,
          });
          return makeMCPToolJSONSuccess({
            message: `Association created successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_associations",
    "Lists all associations for a given HubSpot object (e.g., list all contacts associated with a company).",
    {
      objectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the object"),
      objectId: z.string().describe("The ID of the object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .optional()
        .describe("Optional: specific object type to filter associations"),
    },
    async ({ objectType, objectId, toObjectType }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await listAssociations({
            accessToken,
            objectType,
            objectId,
            toObjectType,
          });
          return makeMCPToolJSONSuccess({
            message: `Associations retrieved successfully for ${objectType}:${objectId}`,
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "remove_association",
    "Removes an association between two HubSpot objects.",
    {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      fromObjectId: z.string().describe("The ID of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
      toObjectId: z.string().describe("The ID of the target object"),
    },
    async (
      { fromObjectType, fromObjectId, toObjectType, toObjectId },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken) => {
          await removeAssociation({
            accessToken,
            fromObjectType,
            fromObjectId,
            toObjectType,
            toObjectId,
          });
          return makeMCPToolJSONSuccess({
            message: `Association removed successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
            result: { success: true },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_current_user_id",
    "Gets the current authenticated user's HubSpot owner ID and profile information. " +
      "Essential first step for getting your own activity data. Returns user_id (needed for get_user_activity), " +
      "user details, and hub_id. Use this before calling get_user_activity with your own data.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getCurrentUserId(accessToken);
          return makeMCPToolJSONSuccess({
            message: "Current user information retrieved successfully",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_user_activity",
    "Comprehensively retrieves user activity across ALL HubSpot engagement types (tasks, notes, meetings, calls, emails) " +
      "for any time period. Solves the problem of getting complete user activity data by automatically trying multiple " +
      "owner property variations and gracefully handling object types that don't support owner filtering. " +
      "Perfect for queries like 'show my activity for the last week' or 'what did I do this month'. " +
      "Returns both detailed activity list and summary statistics by activity type. " +
      "For your own activity: first call get_current_user_id to get your ownerId.",
    {
      ownerId: z
        .string()
        .describe(
          "The HubSpot owner/user ID to get activity for. Get your own ID with get_current_user_id, or use another user's ID from list_owners."
        ),
      startDate: z
        .string()
        .describe(
          "Start date for the activity period. Accepts ISO date strings (e.g., '2024-01-01') or timestamps. For 'last week', calculate 7 days ago."
        ),
      endDate: z
        .string()
        .describe(
          "End date for the activity period. Accepts ISO date strings (e.g., '2024-01-08') or timestamps. For current time, use new Date().toISOString()."
        ),
      limit: z
        .number()
        .optional()
        .default(MAX_LIMIT)
        .describe(
          "Maximum number of activities to return across all engagement types (default: 200)"
        ),
    },
    async ({ ownerId, startDate, endDate, limit }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getUserActivity({
            accessToken,
            ownerId,
            startDate,
            endDate,
            limit,
          });

          if (!result.results || result.results.length === 0) {
            return makeMCPToolTextSuccess({
              message: `No activities found for owner ${ownerId} between ${startDate} and ${endDate}`,
              result: `No activities found for the specified period. Summary: ${JSON.stringify(result.summary, null, 2)}`,
            });
          }

          return makeMCPToolJSONSuccess({
            message: `Found ${result.results.length} activities for owner ${ownerId} between ${startDate} and ${endDate}`,
            result: {
              activities: result.results,
              summary: result.summary,
            },
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
