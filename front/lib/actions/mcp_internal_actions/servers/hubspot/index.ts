import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";

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
} from "./hubspot_api_helper";
import {
  formatHubSpotCreateSuccess,
  formatHubSpotGetSuccess,
  formatHubSpotObjectsAsText,
  formatHubSpotSearchResults,
  formatHubSpotUpdateSuccess,
  formatTransformedPropertiesAsText,
} from "./hubspot_response_helpers";
import { HUBSPOT_ID_TO_OBJECT_TYPE } from "./hubspot_utils";
import {
  ERROR_MESSAGES,
  generateUrls,
  validateRequests,
  withAuth,
} from "./hubspot_utils";
import {
  countObjectsByPropertiesSchema,
  createAssociationSchema,
  createCommunicationSchema,
  createCompanySchema,
  createContactSchema,
  createDealSchema,
  createLeadSchema,
  createMeetingSchema,
  createNoteSchema,
  createTaskSchema,
  exportCrmObjectsCsvSchema,
  getAssociatedMeetingsSchema,
  getCompanySchema,
  getContactSchema,
  getCurrentUserIdSchema,
  getDealSchema,
  getFilePublicUrlSchema,
  getHubspotLinkSchema,
  getHubspotPortalIdSchema,
  getLatestObjectsSchema,
  getMeetingSchema,
  getObjectByEmailSchema,
  getObjectPropertiesSchema,
  getUserActivitySchema,
  listAssociationsSchema,
  listOwnersSchema,
  removeAssociationSchema,
  searchCrmObjectsSchema,
  searchOwnersSchema,
  updateCompanySchema,
  updateContactSchema,
  updateDealSchema,
} from "./metadata";

function createServer(): McpServer {
  const server = makeInternalMCPServer("hubspot");

  server.tool(
    "get_object_properties",
    "Lists all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    getObjectPropertiesSchema,
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
          return {
            isError: false,
            content: [
              { type: "text", text: "Properties retrieved successfully" },
              { type: "text", text: formattedText },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_contact",
    "Creates a new contact in Hubspot, with optional associations.",
    createContactSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createContact({
            accessToken,
            properties,
            associations,
          });
          const formatted = formatHubSpotCreateSuccess(result, "contacts");
          return {
            isError: false,
            content: [
              { type: "text", text: formatted.message },
              { type: "text", text: JSON.stringify(formatted.result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_object_by_email",
    `Retrieves a Hubspot object using an email address. Supports ${ALL_OBJECTS.join(", ")}.`,
    getObjectByEmailSchema,
    async ({ objectType, email }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const object = await getObjectByEmail(accessToken, objectType, email);
          if (!object) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.OBJECT_NOT_FOUND },
              ],
            };
          }
          // Handle different object types properly
          if ("email" in object) {
            // This is a SimplePublicObject
            const formatted = formatHubSpotGetSuccess(
              object as any,
              objectType
            );
            return {
              isError: false,
              content: [
                { type: "text", text: formatted.message },
                {
                  type: "text",
                  text: JSON.stringify(formatted.result, null, 2),
                },
              ],
            };
          } else {
            // This is a PublicOwner - return simpler format
            const owner = object as any;
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: `${objectType.slice(0, -1)} retrieved successfully`,
                },
                {
                  type: "text",
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
              ],
            };
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
    listOwnersSchema,
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const owners = await listOwners(accessToken);
          if (!owners.length) {
            return {
              isError: true,
              content: [{ type: "text", text: "No owners found." }],
            };
          }
          return {
            isError: false,
            content: [
              { type: "text", text: "Owners retrieved successfully." },
              { type: "text", text: JSON.stringify(owners, null, 2) },
            ],
          };
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
    searchOwnersSchema,
    async ({ searchQuery }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const owners = await searchOwners(accessToken, searchQuery);
          if (!owners.length) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `No owners found matching "${searchQuery}".`,
                },
              ],
            };
          }
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Found ${owners.length} owner(s) matching "${searchQuery}".`,
              },
              { type: "text", text: JSON.stringify(owners, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "count_objects_by_properties",
    `Count objects in Hubspot with matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_COUNT_LIMIT} objects.`,
    countObjectsByPropertiesSchema,
    async ({ objectType, filters }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const count = await countObjectsByProperties(
            accessToken,
            objectType,
            filters
          );
          if (!count) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.NO_OBJECTS_FOUND },
              ],
            };
          }
          if (count >= MAX_COUNT_LIMIT) {
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: `Found ${MAX_COUNT_LIMIT}+ ${objectType} matching the filters (exact count unavailable due to API limits)`,
                },
                { type: "text", text: `${MAX_COUNT_LIMIT}+` },
              ],
            };
          }
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Found ${count} ${objectType} matching the specified filters`,
              },
              { type: "text", text: count.toString() },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_latest_objects",
    `Get latest objects from Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}. Limit is ${MAX_LIMIT}.`,
    getLatestObjectsSchema,
    async ({ objectType, limit = MAX_LIMIT }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const objects = await getLatestObjects(
            accessToken,
            objectType,
            limit
          );
          if (!objects.length) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.NO_OBJECTS_FOUND },
              ],
            };
          }
          const formattedText = formatHubSpotObjectsAsText(objects, objectType);
          return {
            isError: false,
            content: [
              { type: "text", text: "Latest objects retrieved successfully" },
              { type: "text", text: formattedText },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_company",
    "Creates a new company in Hubspot, with optional associations.",
    createCompanySchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createCompany({
            accessToken,
            properties,
            associations,
          });
          const formatted = formatHubSpotCreateSuccess(result, "companies");
          return {
            isError: false,
            content: [
              { type: "text", text: formatted.message },
              { type: "text", text: JSON.stringify(formatted.result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_deal",
    "Creates a new deal in Hubspot, with optional associations.",
    createDealSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createDeal({
            accessToken,
            properties,
            associations,
          });
          return {
            isError: false,
            content: [
              { type: "text", text: "Deal created successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_lead",
    "Creates a new lead in Hubspot (as a Deal), with optional associations. Ensure properties correctly define it as a lead.",
    createLeadSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createLead({
            accessToken,
            properties,
            associations,
          });
          return {
            isError: false,
            content: [
              { type: "text", text: "Lead (as Deal) created successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_task",
    "Creates a new task in Hubspot, with optional associations.",
    createTaskSchema,
    async (input, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createTask({
            accessToken,
            properties: input.properties,
            associations: input.associations,
          });
          return {
            isError: false,
            content: [
              { type: "text", text: "Task created successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_note",
    "Creates a new note in Hubspot, with optional associations.",
    createNoteSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createNote({
            accessToken,
            properties,
            associations,
          });
          return {
            isError: false,
            content: [
              { type: "text", text: "Note created successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_communication",
    "Creates a new communication (WhatsApp, LinkedIn, SMS) in Hubspot as an engagement. Requires hs_communication_channel_type in properties.",
    createCommunicationSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createCommunication({
            accessToken,
            properties,
            associations,
          });
          return {
            isError: false,
            content: [
              {
                type: "text",
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Communication (channel: ${properties.hs_communication_channel_type || "unknown"}) created successfully.`,
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_meeting",
    "Creates a new meeting in Hubspot as an engagement. Ensure hs_engagement_type='MEETING' and meeting details are in properties.",
    createMeetingSchema,
    async ({ properties, associations }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await createMeeting({
            accessToken,
            properties,
            associations,
          });
          return {
            isError: false,
            content: [
              { type: "text", text: "Meeting created successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getContact tool
  server.tool(
    "get_contact",
    "Retrieves a Hubspot contact by its ID.",
    getContactSchema,
    async ({ contactId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getContact(accessToken, contactId);
          if (!result) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.OBJECT_NOT_FOUND },
              ],
            };
          }
          const formatted = formatHubSpotGetSuccess(result, "contacts");
          return {
            isError: false,
            content: [
              { type: "text", text: formatted.message },
              { type: "text", text: JSON.stringify(formatted.result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getCompany tool
  server.tool(
    "get_company",
    "Retrieves a Hubspot company by its ID. Returns default properties plus any additional properties specified.",
    getCompanySchema,
    async ({ companyId, extraProperties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getCompany(
            accessToken,
            companyId,
            extraProperties
          );
          if (!result) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.OBJECT_NOT_FOUND },
              ],
            };
          }
          const formatted = formatHubSpotGetSuccess(result, "companies");
          return {
            isError: false,
            content: [
              { type: "text", text: formatted.message },
              { type: "text", text: JSON.stringify(formatted.result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getDeal tool
  server.tool(
    "get_deal",
    "Retrieves a Hubspot deal by its ID. Returns default properties plus any additional properties specified.",
    getDealSchema,
    async ({ dealId, extraProperties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getDeal(accessToken, dealId, extraProperties);
          if (!result) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.OBJECT_NOT_FOUND },
              ],
            };
          }
          return {
            isError: false,
            content: [
              { type: "text", text: "Deal retrieved successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getMeeting tool
  server.tool(
    "get_meeting",
    "Retrieves a Hubspot meeting (engagement) by its ID.",
    getMeetingSchema,
    async ({ meetingId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getMeeting(accessToken, meetingId);
          if (!result) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    ERROR_MESSAGES.OBJECT_NOT_FOUND +
                    " Or it was not a meeting.",
                },
              ],
            };
          }
          return {
            isError: false,
            content: [
              { type: "text", text: "Meeting retrieved successfully." },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getFilePublicUrl tool
  server.tool(
    "get_file_public_url",
    "Retrieves a publicly available URL for a file in HubSpot.",
    getFilePublicUrlSchema,
    async ({ fileId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getFilePublicUrl(accessToken, fileId);
          if (!result) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "File not found or public URL not available.",
                },
              ],
            };
          }
          return {
            isError: false,
            content: [
              { type: "text", text: "File public URL retrieved successfully." },
              { type: "text", text: JSON.stringify({ url: result }, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for getAssociatedMeetings tool
  server.tool(
    "get_associated_meetings",
    "Retrieves meetings associated with a specific object (contact, company, or deal).",
    getAssociatedMeetingsSchema,
    async ({ fromObjectType, fromObjectId }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getAssociatedMeetings(
            accessToken,
            fromObjectType,
            fromObjectId
          );
          if (result === null) {
            return {
              isError: true,
              content: [
                { type: "text", text: "Error retrieving associated meetings." },
              ],
            };
          }
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: "Associated meetings retrieved successfully.",
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Definition for searchCrmObjects tool
  server.tool(
    "update_contact",
    "Updates properties of a HubSpot contact by ID.",
    updateContactSchema,
    async ({ contactId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateContact({
            accessToken,
            contactId,
            properties,
          });
          const formatted = formatHubSpotUpdateSuccess(result, "contacts");
          return {
            isError: false,
            content: [
              { type: "text", text: formatted.message },
              { type: "text", text: JSON.stringify(formatted.result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_company",
    "Updates properties of a HubSpot company by ID.",
    updateCompanySchema,
    async ({ companyId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateCompany({
            accessToken,
            companyId,
            properties,
          });
          return {
            isError: false,
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_deal",
    "Updates properties of a HubSpot deal by ID.",
    updateDealSchema,
    async ({ dealId, properties }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await updateDeal({
            accessToken,
            dealId,
            properties,
          });
          return {
            isError: false,
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
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
    searchCrmObjectsSchema,
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
          if (!result) {
            return {
              isError: true,
              content: [{ type: "text", text: "Search failed." }],
            };
          }
          if (result.results.length === 0) {
            return {
              isError: false,
              content: [{ type: "text", text: "No results found." }],
            };
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
    exportCrmObjectsCsvSchema,
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
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to fetch objects from HubSpot: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
      if (!allResults.length) {
        return {
          isError: false,
          content: [{ type: "text", text: "No objects found for export." }],
        };
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

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Exported ${csvRows.length} ${input.objectType} to CSV`,
          },
          { type: "text", text: fullCsv },
        ],
      };
    }
  );

  server.tool(
    "get_hubspot_link",
    "Purpose: Generates HubSpot UI links for different pages based on object types and IDs. " +
      "Supports both index pages (lists of objects) and record pages (specific object details). " +
      "Prerequisites: Use the hubspot-get-portal-id tool to get the PortalId and UiDomain. " +
      "Usage Guidance: Use to generate links to HubSpot UI pages when users need to reference specific HubSpot records. " +
      "Validates that object type IDs exist in the HubSpot system.",
    getHubspotLinkSchema,
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

        return {
          isError: true,
          content: [
            { type: "text", text: JSON.stringify(errorResponse, null, 2) },
          ],
        };
      }
      const urlResults = generateUrls(portalId, uiDomain, pageRequests);

      return {
        isError: false,
        content: [
          { type: "text", text: "HubSpot links generated successfully." },
          { type: "text", text: JSON.stringify(urlResults, null, 2) },
        ],
      };
    }
  );

  server.tool(
    "get_hubspot_portal_id",
    "Gets the current user's portal ID. To use before calling get_hubspot_link",
    getHubspotPortalIdSchema,
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getUserDetails(accessToken);
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: "Portal information retrieved successfully",
              },
              {
                type: "text",
                text: `Portal ID: ${result.hub_id}\nUI Domain: app.hubspot.com`,
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_association",
    "Creates an association between two existing HubSpot objects (e.g., associate a contact with a company).",
    createAssociationSchema,
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
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Association created successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_associations",
    "Lists all associations for a given HubSpot object (e.g., list all contacts associated with a company).",
    listAssociationsSchema,
    async ({ objectType, objectId, toObjectType }, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await listAssociations({
            accessToken,
            objectType,
            objectId,
            toObjectType,
          });
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Associations retrieved successfully for ${objectType}:${objectId}`,
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
        },
        authInfo,
      });
    }
  );

  server.tool(
    "remove_association",
    "Removes an association between two HubSpot objects.",
    removeAssociationSchema,
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
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Association removed successfully between ${fromObjectType}:${fromObjectId} and ${toObjectType}:${toObjectId}`,
              },
              {
                type: "text",
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
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
    getCurrentUserIdSchema,
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken) => {
          const result = await getCurrentUserId(accessToken);
          return {
            isError: false,
            content: [
              {
                type: "text",
                text: "Current user information retrieved successfully",
              },
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
          };
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
    getUserActivitySchema,
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
            return {
              isError: false,
              content: [
                {
                  type: "text",
                  text: `No activities found for owner ${ownerId} between ${startDate} and ${endDate}`,
                },
                {
                  type: "text",
                  text: `No activities found for the specified period. Summary: ${JSON.stringify(result.summary, null, 2)}`,
                },
              ],
            };
          }

          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Found ${result.results.length} activities for owner ${ownerId} between ${startDate} and ${endDate}`,
              },
              {
                type: "text",
                text: JSON.stringify(
                  {
                    activities: result.results,
                    summary: result.summary,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  return server;
}

export default createServer;
