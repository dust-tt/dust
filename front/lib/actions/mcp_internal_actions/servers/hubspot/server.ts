import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  ALL_OBJECTS,
  countObjectsByProperties,
  createCommunication,
  createCompany,
  createContact,
  createDeal,
  createLead,
  createMeeting,
  createNote,
  createTask,
  createTicket,
  getAssociatedMeetings,
  getCompany,
  getContact,
  getDeal,
  getFilePublicUrl,
  getLatestObjects,
  getMeeting,
  getObjectByEmail,
  getObjectProperties,
  MAX_COUNT_LIMIT,
  MAX_LIMIT,
  searchCrmObjects,
  SIMPLE_OBJECTS,
  updateContact,
  updateCompany,
  updateDeal,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_api_helper";
import {
  ERROR_MESSAGES,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hupspot_utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "hubspot",
  version: "1.0.0",
  description:
    "Supports creating, retrieving, and searching CRM objects (contacts, companies, deals, etc.), managing engagements, and accessing object properties, etc.",
  authorization: {
    provider: "hubspot" as const,
    supported_use_cases: ["platform_actions"] as const,
  },
  icon: "HubspotLogo",
  documentationUrl: null,
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

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
          return makeMCPToolJSONSuccess({
            message: "Operation completed successfully",
            result,
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
          return makeMCPToolJSONSuccess({
            message: "Contact created successfully.",
            result,
          });
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
          return makeMCPToolJSONSuccess({
            message: "Operation completed successfully",
            result: object,
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
          if (count === MAX_COUNT_LIMIT) {
            return makeMCPToolTextError(
              `Can't retrieve the exact number of objects matching the filters (hit Hubspot API limit of max ${MAX_COUNT_LIMIT} total objects).`
            );
          }
          return makeMCPToolTextSuccess({
            message: "Operation completed successfully",
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
          return makeMCPToolJSONSuccess({
            message: "Operation completed successfully",
            result: objects,
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
          return makeMCPToolJSONSuccess({
            message: "Company created successfully.",
            result,
          });
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
    "create_ticket",
    "Creates a new ticket in Hubspot, with optional associations.",
    {
      properties: z.record(z.string()).describe("Properties for the ticket."),
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
          const result = await createTicket({
            accessToken,
            properties: input.properties,
            associations: input.associations,
          });
          return makeMCPToolJSONSuccess({
            message: "Ticket created successfully.",
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
          ticketIds: z.array(z.string()).optional(),
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
          ticketIds: z.array(z.string()).optional(),
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
          ticketIds: z.array(z.string()).optional(),
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
          return makeMCPToolJSONSuccess({
            message: "Contact retrieved successfully.",
            result,
          });
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
          return makeMCPToolJSONSuccess({
            message: "Company retrieved successfully.",
            result,
          });
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
    "tickets",
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
          return makeMCPToolJSONSuccess({
            result,
          });
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
    "Searches CRM objects of a specific type based on filters, query, and properties.",
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
          if (!result) {
            return makeMCPToolTextError(
              "Search failed or returned no results."
            );
          }
          return makeMCPToolJSONSuccess({
            message: "CRM objects searched successfully.",
            result,
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
