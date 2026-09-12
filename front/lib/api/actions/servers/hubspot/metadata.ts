import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { AssociationSpecAssociationCategoryEnum } from "@hubspot/api-client/lib/codegen/crm/objects/models/AssociationSpec";
import { z } from "zod";

const SIMPLE_OBJECTS = ["contacts", "companies", "deals"] as const;

const objectTypeSchema = z
  .string()
  .describe(
    `The HubSpot object type: a standard object type name, or — for custom ` +
      `objects — the object type ID (e.g. "2-12345") or fully-qualified name, ` +
      `discoverable via list_custom_object_schemas.`
  );

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

export const HUBSPOT_TOOLS_METADATA = [
  // Read operations
  {
    name: "get_object_properties",
    description:
      "List all available properties for a Hubspot object. When creatableOnly is true, returns only properties that can be modified through forms (excludes hidden, calculated, read-only and file upload fields).",
    schema: {
      objectType: objectTypeSchema,
      creatableOnly: z.boolean().optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot object properties",
      done: "Retrieve HubSpot object properties",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_custom_object_schemas",
    description:
      "List all custom object types (schemas) defined in the HubSpot account, " +
      "with their type IDs, fully-qualified names, and properties. Use this to " +
      "discover the object type to pass to search_crm_objects, get_object_properties, " +
      "create_custom_object, and update_custom_object.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot custom object schemas",
      done: "List HubSpot custom object schemas",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_owners",
    description:
      "List all owners (users) in the HubSpot account with their IDs, names, and email addresses. " +
      "Use this to find owner IDs for get_user_activity calls when you want to get activity for other users. " +
      "For your own activity, use get_current_user_id instead.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot owners",
      done: "List HubSpot owners",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "search_owners",
    description:
      "Search for specific owners (users) in the HubSpot account by email, name, ID, or user ID. " +
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "count_objects_by_properties",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_meeting",
    description: "Retrieve a Hubspot meeting (engagement) by its ID.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_file_public_url",
    description: "Retrieve a publicly available URL for a file in HubSpot.",
    schema: {
      fileId: z.string().describe("The ID of the file."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot file public URL",
      done: "Retrieve HubSpot file public URL",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_associated_meetings",
    description:
      "Retrieve meetings associated with a specific object (contact, company, or deal).",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "search_crm_objects",
    description:
      "Search, filter, read, open, or retrieve HubSpot records: contacts, companies, deals, " +
      "leads, tickets, activity records (tasks, notes, meetings, calls, emails), and custom objects. " +
      "Filter by any property to: open or read a single contact, company, or deal record " +
      "by its id (hs_object_id EQ <id>); find a contact or company by email; " +
      "find contacts at a company; search deals by close date or amount; " +
      "filter by owner (hubspot_owner_id); or match any other property. " +
      "Omit filters to get the most recently created records (sorted newest-first). " +
      "Also supports free-text queries. " +
      "IMPORTANT: For enumeration properties (like industry or dealstage), use " +
      "get_object_properties first to discover the exact values. " +
      "For comprehensive user activity across all types, use get_user_activity.",
    schema: {
      objectType: objectTypeSchema,
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
      after: z
        .string()
        .optional()
        .describe("Pagination cursor (paging.after from a previous response)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching HubSpot CRM objects",
      done: "Search HubSpot CRM objects",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "export_crm_objects_csv",
    description:
      "Export CRM objects of a given type to CSV, with filters, property selection, and row limits. The resulting file is available for table queries.",
    schema: {
      objectType: objectTypeSchema,
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_hubspot_link",
    description:
      "Generate HubSpot UI links for different pages based on object types and IDs. " +
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_hubspot_portal_id",
    description:
      "Get the current user's portal ID. To use before calling get_hubspot_link",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot portal ID",
      done: "Retrieve HubSpot portal ID",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_associations",
    description:
      "List all associations for a given HubSpot object (e.g., list all contacts associated with a company).",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_association_labels",
    description:
      "List the available association labels between two HubSpot object types " +
      "(e.g., the 'Parent Company'/'Child Company' labels between companies). " +
      "Returns each label's category and typeId, to be passed to create_association.",
    schema: {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot association labels",
      done: "List HubSpot association labels",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_current_user_id",
    description:
      "Identify who you are in HubSpot: get the current authenticated user's " +
      "HubSpot owner ID and profile information. " +
      "Essential first step for getting your own activity data. Returns user_id (needed for get_user_activity), " +
      "user details, and hub_id. Use this before calling get_user_activity with your own data.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot current user ID",
      done: "Retrieve HubSpot current user ID",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_user_activity",
    description:
      "Retrieve comprehensive user activity across ALL HubSpot engagement types (tasks, notes, meetings, calls, emails) " +
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },

  // Marketing email operations
  {
    name: "list_marketing_emails",
    description:
      "List marketing emails from HubSpot. Supports filtering by state (e.g., DRAFT, PUBLISHED, AUTOMATED) and pagination. " +
      "Returns email name, subject, state, publish date, and other metadata.",
    schema: {
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of emails to return (default: 50)."),
      after: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous response."),
      state: z
        .string()
        .optional()
        .describe(
          "Filter by email state (e.g., DRAFT, PUBLISHED, AUTOMATED, AUTOMATED_FOR_FORM, AUTOMATED_FOR_FORM_LEGACY, RSS_TO_EMAIL, BLOG_EMAIL, OPTIN_EMAIL, OPTIN_FOLLOWUP)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot marketing emails",
      done: "List HubSpot marketing emails",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_marketing_email",
    description:
      "Retrieve a single marketing email by its ID. Returns full email details including name, subject, state, content, and metadata.",
    schema: {
      emailId: z
        .string()
        .describe("The ID of the marketing email to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot marketing email",
      done: "Retrieve HubSpot marketing email",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_marketing_email_statistics",
    description:
      "Retrieve deliverability statistics histogram for a marketing email (open rates, click rates, bounces, unsubscribes, etc.). " +
      "Provides time-bucketed data for analyzing email performance over time.",
    schema: {
      emailId: z
        .string()
        .describe("The ID of the marketing email to get statistics for."),
      interval: z
        .string()
        .optional()
        .describe(
          "Time interval for histogram buckets (e.g., WEEK, MONTH). Defaults to the API default if not specified."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot marketing email statistics",
      done: "Retrieve HubSpot marketing email statistics",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_email_events",
    description:
      "List email events (deliveries, opens, clicks, bounces, unsubscribes, etc.) from HubSpot. " +
      "Supports filtering by event type, campaign ID, and time range. " +
      "Event types include: SENT, DELIVERED, OPEN, CLICK, BOUNCE, DEFERRED, DROPPED, STATUSCHANGE, SPAMREPORT, UNBOUNCE.",
    schema: {
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of events to return (default: 100)."),
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
      eventType: z
        .string()
        .optional()
        .describe(
          "Filter by event type (e.g., SENT, DELIVERED, OPEN, CLICK, BOUNCE, DEFERRED, DROPPED, STATUSCHANGE, SPAMREPORT, UNBOUNCE)."
        ),
      campaignId: z
        .string()
        .optional()
        .describe("Filter events by email campaign ID."),
      startTimestamp: z
        .string()
        .optional()
        .describe(
          "Filter events after this timestamp (milliseconds since epoch)."
        ),
      endTimestamp: z
        .string()
        .optional()
        .describe(
          "Filter events before this timestamp (milliseconds since epoch)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot email events",
      done: "List HubSpot email events",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_email_campaigns",
    description:
      "List email campaigns from HubSpot. Returns campaign IDs and basic metadata. " +
      "Use get_email_campaign to get full details including deliverability counters for a specific campaign.",
    schema: {
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of campaigns to return (default: 100)."),
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing HubSpot email campaigns",
      done: "List HubSpot email campaigns",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_email_campaign",
    description:
      "Open and read a detailed HubSpot email campaign report by campaign ID, " +
      "including name, subject, type, " +
      "and deliverability counters (sent, delivered, open, click, bounce, unsubscribe, etc.).",
    schema: {
      campaignId: z
        .string()
        .describe("The ID of the email campaign to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving HubSpot email campaign",
      done: "Retrieve HubSpot email campaign",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },

  // Create operations
  {
    name: "create_contact",
    description: "Create a new contact in Hubspot, with optional associations.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_company",
    description: "Create a new company in Hubspot, with optional associations.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_deal",
    description: "Create a new deal in Hubspot, with optional associations.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_ticket",
    description: "Create a new ticket in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe(
          "Properties for the ticket. `subject` is required; common fields include content, hs_pipeline, hs_pipeline_stage, hs_ticket_priority."
        ),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot ticket",
      done: "Create HubSpot ticket",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_lead",
    description: "Create a new lead in Hubspot, with optional associations.",
    schema: {
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the lead."),
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_task",
    description: "Create a new task in Hubspot, with optional associations.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_note",
    description: "Create a new note in Hubspot, with optional associations.",
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
          hubspot_owner_id: z
            .string()
            .optional()
            .describe("The ID of the note's owner/creator."),
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_communication",
    description:
      "Create a new communication (WhatsApp, LinkedIn, SMS) in Hubspot. Requires hs_communication_channel_type in properties.",
    schema: {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_communication_channel_type (e.g., 'SMS', 'WHATS_APP', 'LINKEDIN'), message content (e.g., hs_communication_body), and hs_timestamp."
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_meeting",
    description:
      "Create a new meeting in Hubspot. Meeting details are in properties.",
    schema: {
      properties: z
        .record(z.any())
        .describe(
          "Properties, including hs_meeting_title, hs_meeting_start_time, hs_meeting_end_time, hs_timestamp, etc."
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_custom_object",
    description:
      "Create a new custom object record in Hubspot, with optional associations. " +
      "Use list_custom_object_schemas to find the object type and its properties.",
    schema: {
      objectType: objectTypeSchema,
      properties: z
        .record(z.string())
        .describe("An object containing the properties for the custom object."),
      associations: z
        .array(associationSchema)
        .optional()
        .describe("Optional array of associations to create."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot custom object",
      done: "Create HubSpot custom object",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_association",
    description:
      "Create an association between two existing HubSpot objects (e.g., associate a contact with a company). " +
      "To create a labeled association (e.g., set a company as the parent/child of another), first call " +
      "list_association_labels to get the label's category and typeId, then pass them here.",
    schema: {
      fromObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the source object"),
      fromObjectId: z.string().describe("The ID of the source object"),
      toObjectType: z
        .enum(["contacts", "companies", "deals"])
        .describe("The type of the target object"),
      toObjectId: z.string().describe("The ID of the target object"),
      associationCategory: z
        .nativeEnum(AssociationSpecAssociationCategoryEnum)
        .optional()
        .describe(
          "Optional association category for a labeled association, from list_association_labels. Defaults to HUBSPOT_DEFINED."
        ),
      associationTypeId: z
        .number()
        .optional()
        .describe(
          "Optional association type id for a labeled association, from list_association_labels. Defaults to the primary unlabeled association."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Creating HubSpot association",
      done: "Create HubSpot association",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },

  // Update operations
  {
    name: "update_contact",
    description: "Update properties of a HubSpot contact by ID.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_company",
    description: "Update properties of a HubSpot company by ID.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_deal",
    description: "Update properties of a HubSpot deal by ID.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_custom_object",
    description:
      "Update properties of a HubSpot custom object record by ID. Use " +
      "list_custom_object_schemas to find the object type and its properties.",
    schema: {
      objectType: objectTypeSchema,
      objectId: z.string().describe("The ID of the custom object to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating HubSpot custom object",
      done: "Update HubSpot custom object",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "update_task",
    description:
      "Update properties of a HubSpot task by ID (e.g., hs_task_subject, hs_task_body, hs_timestamp, hs_task_priority, hs_task_status). Set hs_task_status to COMPLETED to mark the task as done.",
    schema: {
      taskId: z.string().describe("The ID of the task to update."),
      properties: z
        .record(z.string())
        .describe(
          "An object containing the properties to update with their new values."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating HubSpot task",
      done: "Update HubSpot task",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "complete_task",
    description:
      "Complete a HubSpot task by ID, setting its status to COMPLETED.",
    schema: {
      taskId: z.string().describe("The ID of the task to complete."),
    },
    stake: "high",
    displayLabels: {
      running: "Completing HubSpot task",
      done: "Complete HubSpot task",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "delete_task",
    description: "Delete a HubSpot task by ID.",
    schema: {
      taskId: z.string().describe("The ID of the task to delete."),
    },
    stake: "high",
    displayLabels: {
      running: "Deleting HubSpot task",
      done: "Delete HubSpot task",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "remove_association",
    description: "Remove an association between two HubSpot objects.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

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
  },
  tools: HUBSPOT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
