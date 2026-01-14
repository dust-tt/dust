import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  ALL_OBJECTS,
  MAX_COUNT_LIMIT,
  MAX_LIMIT,
  SIMPLE_OBJECTS,
} from "@app/lib/actions/mcp_internal_actions/servers/hubspot/hubspot_api_helper";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const HUBSPOT_TOOL_NAME = "hubspot" as const;

export const getObjectPropertiesSchema = {
  objectType: z.enum(ALL_OBJECTS),
  creatableOnly: z.boolean().optional(),
};

export const createContactSchema = {
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
};

export const getObjectByEmailSchema = {
  objectType: z.enum(ALL_OBJECTS),
  email: z.string().describe("The email address of the object."),
};

export const listOwnersSchema = {};

export const searchOwnersSchema = {
  searchQuery: z
    .string()
    .describe(
      "The search query - can be email, first name, last name, full name, owner ID, or user ID"
    ),
};

export const countObjectsByPropertiesSchema = {
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
        value: z.string().optional().describe("The value to compare against"),
        values: z
          .array(z.string())
          .optional()
          .describe(
            "The values to compare against. Required for IN/NOT_IN operators."
          ),
      })
    )
    .describe("Array of property filters to apply."),
};

export const getLatestObjectsSchema = {
  objectType: z.enum(SIMPLE_OBJECTS),
  limit: z.number().optional(),
};

export const createCompanySchema = {
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
};

export const createDealSchema = {
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
};

export const createLeadSchema = {
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
};

export const createTaskSchema = {
  properties: z
    .record(z.string())
    .describe(
      "Properties for the task (e.g., hs_task_subject, hs_task_body, hs_timestamp, hs_task_status, hs_task_priority)."
    ),
  associations: z
    .array(
      z.object({
        toObjectId: z.string(),
        toObjectType: z.string().describe("e.g., contacts, companies, deals"),
      })
    )
    .optional()
    .describe("Optional array of associations to create."),
};

export const createNoteSchema = {
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
};

export const createCommunicationSchema = {
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
};

export const createMeetingSchema = {
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
};

export const getContactSchema = {
  contactId: z.string().describe("The ID of the contact to retrieve."),
};

export const getCompanySchema = {
  companyId: z.string().describe("The ID of the company to retrieve."),
  extraProperties: z
    .array(z.string())
    .optional()
    .describe(
      "Optional additional properties to retrieve beyond the default set (createdate, domain, name, hubspot_owner_id)."
    ),
};

export const getDealSchema = {
  dealId: z.string().describe("The ID of the deal to retrieve."),
  extraProperties: z
    .array(z.string())
    .optional()
    .describe(
      "Optional additional properties to retrieve beyond the default set (amount, hubspot_owner_id, closedate, createdate, dealname, dealstage, hs_lastmodifieddate, hs_object_id, pipeline)."
    ),
};

export const getMeetingSchema = {
  meetingId: z
    .string()
    .describe("The ID of the meeting (engagement) to retrieve."),
};

export const getFilePublicUrlSchema = {
  fileId: z.string().describe("The ID of the file."),
};

export const getAssociatedMeetingsSchema = {
  fromObjectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the object (contacts, companies, or deals)."),
  fromObjectId: z.string().describe("The ID of the object."),
};

export const updateContactSchema = {
  contactId: z.string().describe("The ID of the contact to update."),
  properties: z
    .record(z.string())
    .describe(
      "An object containing the properties to update with their new values."
    ),
};

export const updateCompanySchema = {
  companyId: z.string().describe("The ID of the company to update."),
  properties: z
    .record(z.string())
    .describe(
      "An object containing the properties to update with their new values."
    ),
};

export const updateDealSchema = {
  dealId: z.string().describe("The ID of the deal to update."),
  properties: z
    .record(z.string())
    .describe(
      "An object containing the properties to update with their new values."
    ),
};

export const searchableObjectTypes = z.enum([
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
]);

export const searchCrmObjectsSchema = {
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
};

export const exportCrmObjectsCsvSchema = {
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
};

export const getHubspotLinkSchema = {
  portalId: z.string().describe("The HubSpot portal/account ID"),
  uiDomain: z.string().describe("The HubSpot UI domain"),
  pageRequests: z.array(
    z.object({
      pagetype: z.enum(["record", "index"]),
      objectTypeId: z.string(),
      objectId: z.string().optional(),
    })
  ),
};

export const getHubspotPortalIdSchema = {};

export const createAssociationSchema = {
  fromObjectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the source object"),
  fromObjectId: z.string().describe("The ID of the source object"),
  toObjectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the target object"),
  toObjectId: z.string().describe("The ID of the target object"),
};

export const listAssociationsSchema = {
  objectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the object"),
  objectId: z.string().describe("The ID of the object"),
  toObjectType: z
    .enum(["contacts", "companies", "deals"])
    .optional()
    .describe("Optional: specific object type to filter associations"),
};

export const removeAssociationSchema = {
  fromObjectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the source object"),
  fromObjectId: z.string().describe("The ID of the source object"),
  toObjectType: z
    .enum(["contacts", "companies", "deals"])
    .describe("The type of the target object"),
  toObjectId: z.string().describe("The ID of the target object"),
};

export const getCurrentUserIdSchema = {};

export const getUserActivitySchema = {
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
};

export const HUBSPOT_TOOLS: MCPToolType[] = [
  {
    name: "get_object_properties",
    description:
      "Lists all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    inputSchema: zodToJsonSchema(
      z.object(getObjectPropertiesSchema)
    ) as JSONSchema,
  },
  {
    name: "create_contact",
    description:
      "Creates a new contact in Hubspot, with optional associations.",
    inputSchema: zodToJsonSchema(z.object(createContactSchema)) as JSONSchema,
  },
  {
    name: "get_object_by_email",
    description: `Retrieves a Hubspot object using an email address. Supports contacts, companies, deals, leads, line_items, tickets, products, quotes, owners.`,
    inputSchema: zodToJsonSchema(
      z.object(getObjectByEmailSchema)
    ) as JSONSchema,
  },
  {
    name: "list_owners",
    description:
      "Lists all owners (users) in the HubSpot account with their IDs, names, and email addresses. Use this to find owner IDs for get_user_activity calls when you want to get activity for other users. For your own activity, use get_current_user_id instead.",
    inputSchema: zodToJsonSchema(z.object(listOwnersSchema)) as JSONSchema,
  },
  {
    name: "search_owners",
    description:
      "Searches for specific owners (users) in the HubSpot account by email, name, ID, or user ID. Supports partial matching for names and emails, and exact matching for IDs. Use this to find owner information when you have partial details about a user.",
    inputSchema: zodToJsonSchema(z.object(searchOwnersSchema)) as JSONSchema,
  },
  {
    name: "count_objects_by_properties",
    description: `Count objects in Hubspot with matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is ${MAX_COUNT_LIMIT} objects.`,
    inputSchema: zodToJsonSchema(
      z.object(countObjectsByPropertiesSchema)
    ) as JSONSchema,
  },
  {
    name: "get_latest_objects",
    description: `Get latest objects from Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}. Limit is ${MAX_LIMIT}.`,
    inputSchema: zodToJsonSchema(
      z.object(getLatestObjectsSchema)
    ) as JSONSchema,
  },
  {
    name: "create_company",
    description:
      "Creates a new company in Hubspot, with optional associations.",
    inputSchema: zodToJsonSchema(z.object(createCompanySchema)) as JSONSchema,
  },
  {
    name: "create_deal",
    description: "Creates a new deal in Hubspot, with optional associations.",
    inputSchema: zodToJsonSchema(z.object(createDealSchema)) as JSONSchema,
  },
  {
    name: "create_lead",
    description:
      "Creates a new lead in Hubspot (as a Deal), with optional associations. Ensure properties correctly define it as a lead.",
    inputSchema: zodToJsonSchema(z.object(createLeadSchema)) as JSONSchema,
  },
  {
    name: "create_task",
    description: "Creates a new task in Hubspot, with optional associations.",
    inputSchema: zodToJsonSchema(z.object(createTaskSchema)) as JSONSchema,
  },
  {
    name: "create_note",
    description: "Creates a new note in Hubspot, with optional associations.",
    inputSchema: zodToJsonSchema(z.object(createNoteSchema)) as JSONSchema,
  },
  {
    name: "create_communication",
    description:
      "Creates a new communication (WhatsApp, LinkedIn, SMS) in Hubspot as an engagement. Requires hs_communication_channel_type in properties.",
    inputSchema: zodToJsonSchema(
      z.object(createCommunicationSchema)
    ) as JSONSchema,
  },
  {
    name: "create_meeting",
    description:
      "Creates a new meeting in Hubspot as an engagement. Ensure hs_engagement_type='MEETING' and meeting details are in properties.",
    inputSchema: zodToJsonSchema(z.object(createMeetingSchema)) as JSONSchema,
  },
  {
    name: "get_contact",
    description: "Retrieves a Hubspot contact by its ID.",
    inputSchema: zodToJsonSchema(z.object(getContactSchema)) as JSONSchema,
  },
  {
    name: "get_company",
    description:
      "Retrieves a Hubspot company by its ID. Returns default properties plus any additional properties specified.",
    inputSchema: zodToJsonSchema(z.object(getCompanySchema)) as JSONSchema,
  },
  {
    name: "get_deal",
    description:
      "Retrieves a Hubspot deal by its ID. Returns default properties plus any additional properties specified.",
    inputSchema: zodToJsonSchema(z.object(getDealSchema)) as JSONSchema,
  },
  {
    name: "get_meeting",
    description: "Retrieves a Hubspot meeting (engagement) by its ID.",
    inputSchema: zodToJsonSchema(z.object(getMeetingSchema)) as JSONSchema,
  },
  {
    name: "get_file_public_url",
    description: "Retrieves a publicly available URL for a file in HubSpot.",
    inputSchema: zodToJsonSchema(
      z.object(getFilePublicUrlSchema)
    ) as JSONSchema,
  },
  {
    name: "get_associated_meetings",
    description:
      "Retrieves meetings associated with a specific object (contact, company, or deal).",
    inputSchema: zodToJsonSchema(
      z.object(getAssociatedMeetingsSchema)
    ) as JSONSchema,
  },
  {
    name: "update_contact",
    description: "Updates properties of a HubSpot contact by ID.",
    inputSchema: zodToJsonSchema(z.object(updateContactSchema)) as JSONSchema,
  },
  {
    name: "update_company",
    description: "Updates properties of a HubSpot company by ID.",
    inputSchema: zodToJsonSchema(z.object(updateCompanySchema)) as JSONSchema,
  },
  {
    name: "update_deal",
    description: "Updates properties of a HubSpot deal by ID.",
    inputSchema: zodToJsonSchema(z.object(updateDealSchema)) as JSONSchema,
  },
  {
    name: "search_crm_objects",
    description:
      "Comprehensive search tool for ALL HubSpot object types including contacts, companies, deals, and ALL engagement types (tasks, notes, meetings, calls, emails). Supports advanced filtering by properties, date ranges, owners, and free-text queries. Enhanced to support owner filtering across all engagement types. IMPORTANT: For enumeration properties (like industry), always use get_object_properties first to discover the exact values. Use this for specific searches, or use get_user_activity for comprehensive user activity across all types.",
    inputSchema: zodToJsonSchema(
      z.object(searchCrmObjectsSchema)
    ) as JSONSchema,
  },
  {
    name: "export_crm_objects_csv",
    description:
      "Exports CRM objects of a given type to CSV, with filters, property selection, and row limits. The resulting file is available for table queries.",
    inputSchema: zodToJsonSchema(
      z.object(exportCrmObjectsCsvSchema)
    ) as JSONSchema,
  },
  {
    name: "get_hubspot_link",
    description:
      "Purpose: Generates HubSpot UI links for different pages based on object types and IDs. Supports both index pages (lists of objects) and record pages (specific object details). Prerequisites: Use the hubspot-get-portal-id tool to get the PortalId and UiDomain. Usage Guidance: Use to generate links to HubSpot UI pages when users need to reference specific HubSpot records. Validates that object type IDs exist in the HubSpot system.",
    inputSchema: zodToJsonSchema(z.object(getHubspotLinkSchema)) as JSONSchema,
  },
  {
    name: "get_hubspot_portal_id",
    description:
      "Gets the current user's portal ID. To use before calling get_hubspot_link",
    inputSchema: zodToJsonSchema(
      z.object(getHubspotPortalIdSchema)
    ) as JSONSchema,
  },
  {
    name: "create_association",
    description:
      "Creates an association between two existing HubSpot objects (e.g., associate a contact with a company).",
    inputSchema: zodToJsonSchema(
      z.object(createAssociationSchema)
    ) as JSONSchema,
  },
  {
    name: "list_associations",
    description:
      "Lists all associations for a given HubSpot object (e.g., list all contacts associated with a company).",
    inputSchema: zodToJsonSchema(
      z.object(listAssociationsSchema)
    ) as JSONSchema,
  },
  {
    name: "remove_association",
    description: "Removes an association between two HubSpot objects.",
    inputSchema: zodToJsonSchema(
      z.object(removeAssociationSchema)
    ) as JSONSchema,
  },
  {
    name: "get_current_user_id",
    description:
      "Gets the current authenticated user's HubSpot owner ID and profile information. Essential first step for getting your own activity data. Returns user_id (needed for get_user_activity), user details, and hub_id. Use this before calling get_user_activity with your own data.",
    inputSchema: zodToJsonSchema(
      z.object(getCurrentUserIdSchema)
    ) as JSONSchema,
  },
  {
    name: "get_user_activity",
    description:
      "Comprehensively retrieves user activity across ALL HubSpot engagement types (tasks, notes, meetings, calls, emails) for any time period. Solves the problem of getting complete user activity data by automatically trying multiple owner property variations and gracefully handling object types that don't support owner filtering. Perfect for queries like 'show my activity for the last week' or 'what did I do this month'. Returns both detailed activity list and summary statistics by activity type. For your own activity: first call get_current_user_id to get your ownerId.",
    inputSchema: zodToJsonSchema(z.object(getUserActivitySchema)) as JSONSchema,
  },
];

export const HUBSPOT_SERVER_INFO = {
  name: "hubspot" as const,
  version: "1.0.0",
  description: "Access CRM contacts, deals and customer activities.",
  authorization: {
    provider: "hubspot" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "HubspotLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/hubspot",
  instructions: null,
};

export const HUBSPOT_TOOL_STAKES = {
  // Get operations.
  get_object_properties: "never_ask",
  get_object_by_email: "never_ask",
  get_latest_objects: "never_ask",
  get_contact: "never_ask",
  get_company: "never_ask",
  get_deal: "never_ask",
  get_meeting: "never_ask",
  get_file_public_url: "never_ask",
  get_associated_meetings: "never_ask",
  get_hubspot_link: "never_ask",
  get_hubspot_portal_id: "never_ask",
  list_owners: "never_ask",
  search_owners: "never_ask",
  get_current_user_id: "never_ask",
  get_user_activity: "never_ask",
  list_associations: "never_ask",

  count_objects_by_properties: "never_ask",
  search_crm_objects: "never_ask",
  export_crm_objects_csv: "never_ask",

  // Create operations.
  create_contact: "high",
  create_company: "high",
  create_deal: "high",
  create_lead: "high",
  create_task: "high",
  create_note: "high",
  create_communication: "high",
  create_meeting: "high",
  create_association: "high",

  // Update operations.
  update_contact: "high",
  update_company: "high",
  update_deal: "high",
  remove_association: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
