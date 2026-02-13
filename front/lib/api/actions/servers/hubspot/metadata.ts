import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const HUBSPOT_TOOL_NAME = "hubspot" as const;

const ALL_OBJECTS = ["contacts", "companies", "deals", "owners"] as const;
const SIMPLE_OBJECTS = ["contacts", "companies", "deals"] as const;

const searchableObjectTypes = [
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
] as const;

const filterSchema = z.object({
  propertyName: z.string().describe("The name of the property to search by."),
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
});

const associationSchema = z.object({
  toObjectId: z.string(),
  toObjectType: z.string().describe("e.g., contacts, companies, deals"),
});

const noteAssociationsSchema = z.object({
  contactIds: z.array(z.string()).optional(),
  companyIds: z.array(z.string()).optional(),
  dealIds: z.array(z.string()).optional(),
  ownerIds: z.array(z.string()).optional(),
});

const engagementAssociationsSchema = z.object({
  contactIds: z.array(z.string()).optional(),
  companyIds: z.array(z.string()).optional(),
  dealIds: z.array(z.string()).optional(),
});

const pageRequestSchema = z.object({
  pagetype: z.enum(["record", "index"]),
  objectTypeId: z.string(),
  objectId: z.string().optional(),
});

export const HUBSPOT_TOOLS_METADATA = createToolsRecord({
  // Read operations
  get_object_properties: {
    description:
      "Lists all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    schema: {
      objectType: z.enum(ALL_OBJECTS),
      creatableOnly: z.boolean().optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot object properties",
      done: "Retrieve HubSpot object properties",
    },
  },
  get_object_by_email: {
    description: `Retrieves a Hubspot object using an email address. Supports ${ALL_OBJECTS.join(", ")}.`,
    schema: {
      objectType: z.enum(ALL_OBJECTS),
      email: z.string().describe("The email address of the object."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot object by email",
      done: "Retrieve HubSpot object by email",
    },
  },
  list_owners: {
    description:
      "Lists all owners (users) in the HubSpot account with their IDs, names, and email addresses. " +
      "Use this to find owner IDs for get_user_activity calls when you want to get activity for other users. " +
      "For your own activity, use get_current_user_id instead.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot owners",
      done: "List HubSpot owners",
    },
  },
  search_owners: {
    description:
      "Searches for specific owners (users) in the HubSpot account by email, name, ID, or user ID. " +
      "Supports partial matching for names and emails, and exact matching for IDs. " +
      "Use this to find owner information when you have partial details about a user.",
    schema: {
      searchQuery: z
        .string()
        .describe(
          "The search query - can be email, first name, last name, full name, owner ID, or user ID"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching HubSpot owners",
      done: "Search HubSpot owners",
    },
  },
  count_objects_by_properties: {
    description: `Count objects in Hubspot with matching properties. Supports ${SIMPLE_OBJECTS.join(", ")}. Max limit is 10000 objects.`,
    schema: {
      objectType: z.enum(SIMPLE_OBJECTS),
      filters: z
        .array(filterSchema)
        .describe("Array of property filters to apply."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Counting HubSpot objects by properties",
      done: "Count HubSpot objects by properties",
    },
  },
  get_latest_objects: {
    description: `Get latest objects from Hubspot. Supports ${SIMPLE_OBJECTS.join(", ")}. Limit is 200.`,
    schema: {
      objectType: z.enum(SIMPLE_OBJECTS),
      limit: z.number().optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving latest HubSpot objects",
      done: "Retrieve latest HubSpot objects",
    },
  },
  get_contact: {
    description: "Retrieves a Hubspot contact by its ID.",
    schema: {
      contactId: z.string().describe("The ID of the contact to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot contact",
      done: "Retrieve HubSpot contact",
    },
  },
  get_company: {
    description:
      "Retrieves a Hubspot company by its ID. Returns default properties plus any additional properties specified.",
    schema: {
      companyId: z.string().describe("The ID of the company to retrieve."),
      extraProperties: z
        .array(z.string())
        .optional()
        .describe(
          "Optional additional properties to retrieve beyond the default set (createdate, domain, name, hubspot_owner_id)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot company",
      done: "Retrieve HubSpot company",
    },
  },
  get_deal: {
    description:
      "Retrieves a Hubspot deal by its ID. Returns default properties plus any additional properties specified.",
    schema: {
      dealId: z.string().describe("The ID of the deal to retrieve."),
      extraProperties: z
        .array(z.string())
        .optional()
        .describe(
          "Optional additional properties to retrieve beyond the default set (amount, hubspot_owner_id, closedate, createdate, dealname, dealstage, hs_lastmodifieddate, hs_object_id, pipeline)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot deal",
      done: "Retrieve HubSpot deal",
    },
  },
  get_meeting: {
    description: "Retrieves a Hubspot meeting (engagement) by its ID.",
    schema: {
      meetingId: z
        .string()
        .describe("The ID of the meeting (engagement) to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot meeting",
      done: "Retrieve HubSpot meeting",
    },
  },
  get_file_public_url: {
    description: "Retrieves a publicly available URL for a file in HubSpot.",
    schema: {
      fileId: z.string().describe("The ID of the file."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot file public URL",
      done: "Retrieve HubSpot file public URL",
    },
  },
  get_associated_meetings: {
    description:
      "Retrieves meetings associated with a specific object (contact, company, or deal).",
    schema: {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the object (contacts, companies, or deals)."),
      fromObjectId: z.string().describe("The ID of the object."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot associated meetings",
      done: "Retrieve HubSpot associated meetings",
    },
  },
  search_crm_objects: {
    description:
      "Comprehensive search tool for ALL HubSpot object types including contacts, companies, deals, " +
      "and ALL engagement types (tasks, notes, meetings, calls, emails). Supports advanced filtering by properties, " +
      "date ranges, owners, and free-text queries. Enhanced to support owner filtering across all engagement types. " +
      "IMPORTANT: For enumeration properties (like industry), always use get_object_properties first to discover the exact values. " +
      "Use this for specific searches, or use get_user_activity for comprehensive user activity across all types.",
    schema: {
      objectType: z.enum(searchableObjectTypes),
      filters: z
        .array(filterSchema)
        .optional()
        .describe("Array of property filters."),
      query: z.string().optional().describe("Free-text query string."),
      propertiesToReturn: z
        .array(z.string())
        .optional()
        .describe("Specific properties to return."),
      limit: z.number().optional().default(200),
      after: z.string().optional().describe("Pagination cursor."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching HubSpot CRM objects",
      done: "Search HubSpot CRM objects",
    },
  },
  export_crm_objects_csv: {
    description:
      "Exports CRM objects of a given type to CSV, with filters, property selection, and row limits. The resulting file is available for table queries.",
    schema: {
      objectType: z.enum(searchableObjectTypes),
      propertiesToExport: z
        .array(z.string())
        .min(1)
        .describe("Properties to include in the CSV."),
      filters: z.array(filterSchema).optional(),
      query: z.string().optional().describe("Free-text query string."),
      maxRows: z
        .number()
        .optional()
        .default(2000)
        .describe("Maximum number of rows to export (hard limit: 2000)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Exporting HubSpot CRM objects to CSV",
      done: "Export HubSpot CRM objects to CSV",
    },
  },
  get_hubspot_link: {
    description:
      "Purpose: Generates HubSpot UI links for different pages based on object types and IDs. " +
      "Supports both index pages (lists of objects) and record pages (specific object details). " +
      "Prerequisites: Use the hubspot-get-portal-id tool to get the PortalId and UiDomain. " +
      "Usage Guidance: Use to generate links to HubSpot UI pages when users need to reference specific HubSpot records. " +
      "Validates that object type IDs exist in the HubSpot system.",
    schema: {
      portalId: z.string().describe("The HubSpot portal/account ID"),
      uiDomain: z.string().describe("The HubSpot UI domain"),
      pageRequests: z.array(pageRequestSchema),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot UI link",
      done: "Retrieve HubSpot UI link",
    },
  },
  get_hubspot_portal_id: {
    description:
      "Gets the current user's portal ID. To use before calling get_hubspot_link",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot portal ID",
      done: "Retrieve HubSpot portal ID",
    },
  },
  list_associations: {
    description:
      "Lists all associations for a given HubSpot object (e.g., list all contacts associated with a company).",
    schema: {
      objectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the object"),
      objectId: z.string().describe("The ID of the object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .optional()
        .describe("Optional: specific object type to filter associations"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot associations",
      done: "List HubSpot associations",
    },
  },
  get_current_user_id: {
    description:
      "Gets the current authenticated user's HubSpot owner ID and profile information. " +
      "Essential first step for getting your own activity data. Returns user_id (needed for get_user_activity), " +
      "user details, and hub_id. Use this before calling get_user_activity with your own data.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot current user ID",
      done: "Retrieve HubSpot current user ID",
    },
  },
  get_user_activity: {
    description:
      "Comprehensively retrieves user activity across ALL HubSpot engagement types (tasks, notes, meetings, calls, emails) " +
      "for any time period. Solves the problem of getting complete user activity data by automatically trying multiple " +
      "owner property variations and gracefully handling object types that don't support owner filtering. " +
      "Perfect for queries like 'show my activity for the last week' or 'what did I do this month'. " +
      "Returns both detailed activity list and summary statistics by activity type. " +
      "For your own activity: first call get_current_user_id to get your ownerId.",
    schema: {
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
        .default(200)
        .describe(
          "Maximum number of activities to return across all engagement types (default: 200)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot user activity",
      done: "Retrieve HubSpot user activity",
    },
  },

  // Create operations
  create_contact: {
    description:
      "Creates a new contact in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the contact."),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot contact",
      done: "Create HubSpot contact",
    },
  },
  create_company: {
    description:
      "Creates a new company in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the company."),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot company",
      done: "Create HubSpot company",
    },
  },
  create_deal: {
    description: "Creates a new deal in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the deal."),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot deal",
      done: "Create HubSpot deal",
    },
  },
  create_lead: {
    description:
      "Creates a new lead in Hubspot (as a Deal), with optional associations. Ensure properties correctly define it as a lead.",
    schema: {
      properties: z
        .record(z.string())
        .describe(
          "Properties for the lead (deal), including those that identify it as a lead."
        ),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot lead",
      done: "Create HubSpot lead",
    },
  },
  create_task: {
    description: "Creates a new task in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe(
          "Properties for the task (e.g., hs_task_subject, hs_task_body, hs_timestamp, hs_task_status, hs_task_priority)."
        ),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot task",
      done: "Create HubSpot task",
    },
  },
  create_note: {
    description: "Creates a new note in Hubspot, with optional associations.",
    schema: {
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
      associations: noteAssociationsSchema
        .optional()
        .describe("Direct IDs of objects to associate the note with."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot note",
      done: "Create HubSpot note",
    },
  },
  create_communication: {
    description:
      "Creates a new communication (WhatsApp, LinkedIn, SMS) in Hubspot as an engagement. Requires hs_communication_channel_type in properties.",
    schema: {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_engagement_type (e.g., 'COMMUNICATION'), hs_communication_channel_type, and message content (e.g., hs_communication_body)."
        ),
      associations: engagementAssociationsSchema
        .optional()
        .describe("Direct IDs of objects to associate the communication with."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot communication",
      done: "Create HubSpot communication",
    },
  },
  create_meeting: {
    description:
      "Creates a new meeting in Hubspot as an engagement. Ensure hs_engagement_type='MEETING' and meeting details are in properties.",
    schema: {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_engagement_type='MEETING', hs_meeting_title, hs_meeting_start_time, etc."
        ),
      associations: engagementAssociationsSchema
        .optional()
        .describe("Direct IDs of objects to associate the meeting with."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot meeting",
      done: "Create HubSpot meeting",
    },
  },
  create_association: {
    description:
      "Creates an association between two existing HubSpot objects (e.g., associate a contact with a company).",
    schema: {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      fromObjectId: z.string().describe("The ID of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
      toObjectId: z.string().describe("The ID of the target object"),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot association",
      done: "Create HubSpot association",
    },
  },

  // Update operations
  update_contact: {
    description: "Updates properties of a HubSpot contact by ID.",
    schema: {
      contactId: z.string().describe("The ID of the contact to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating HubSpot contact",
      done: "Update HubSpot contact",
    },
  },
  update_company: {
    description: "Updates properties of a HubSpot company by ID.",
    schema: {
      companyId: z.string().describe("The ID of the company to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating HubSpot company",
      done: "Update HubSpot company",
    },
  },
  update_deal: {
    description: "Updates properties of a HubSpot deal by ID.",
    schema: {
      dealId: z.string().describe("The ID of the deal to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating HubSpot deal",
      done: "Update HubSpot deal",
    },
  },
  remove_association: {
    description: "Removes an association between two HubSpot objects.",
    schema: {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      fromObjectId: z.string().describe("The ID of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
      toObjectId: z.string().describe("The ID of the target object"),
    },
    stake: "high",
    displayLabels: {
      running: "Removing HubSpot association",
      done: "Remove HubSpot association",
    },
  },
});

export const HUBSPOT_SERVER = {
  serverInfo: {
    name: "hubspot",
    version: "1.0.0",
    description: "Access CRM contacts, deals and customer activities.",
    authorization: {
      provider: "hubspot" as const,
      supported_use_cases: ["platform_actions", "personal_actions"] as const,
    },
    icon: "HubspotLogo",
    documentationUrl: "https://docs.dust.tt/docs/hubspot",
    instructions: null,
  },
  tools: Object.values(HUBSPOT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(HUBSPOT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
