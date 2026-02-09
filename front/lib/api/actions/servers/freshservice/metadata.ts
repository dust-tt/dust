import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { FRESHSERVICE_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/instructions";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { FreshserviceTicketSchema } from "@app/lib/api/actions/servers/freshservice/types";

export const FRESHSERVICE_TOOL_NAME = "freshservice" as const;

const ALLOWED_TICKET_INCLUDES = [
  "conversations",
  "requester",
  "stats",
  "problem",
  "assets",
  "changes",
  "related_tickets",
  "onboarding_context",
  "offboarding_context",
] as const;

export const FRESHSERVICE_TOOLS_METADATA = createToolsRecord({
  // Ticket operations
  list_tickets: {
    description:
      "Lists tickets with optional filtering and pagination. By default returns minimal fields (id, subject, status) for performance.",
    schema: {
      filter: z
        .object({
          email: z.string().optional().describe("Requester email"),
          requester_id: z.number().optional().describe("Requester ID"),
          updated_since: z
            .string()
            .optional()
            .describe(
              "ISO 8601 date-time string to filter tickets updated since this time"
            ),
          type: z.string().optional().describe("Ticket type"),
          filter_type: z
            .enum(["new_and_my_open", "watching", "spam", "deleted"])
            .optional()
            .describe("Predefined Freshservice filter types"),
        })
        .optional(),
      fields: z
        .array(FreshserviceTicketSchema.keyof())
        .optional()
        .describe(
          "Optional list of fields to include. Defaults to essential fields for performance."
        ),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice tickets",
      done: "List Freshservice tickets",
    },
  },
  get_ticket: {
    description:
      "Gets detailed information about a specific ticket. By default returns essential fields for performance, but you can specify specific fields.",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      fields: z
        .array(FreshserviceTicketSchema.keyof())
        .optional()
        .describe(
          "Optional list of fields to include. Defaults to essential fields (id, subject, description_text, priority, status, requester_id, responder_id, department_id, group_id, type, created_at, updated_at, due_by) for performance."
        ),
      include: z
        .array(z.enum(ALLOWED_TICKET_INCLUDES))
        .optional()
        .describe(
          "Additional information to include (e.g., conversations, requester, stats, problem, assets, changes, related_tickets, onboarding_context, offboarding_context)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice ticket",
      done: "Get Freshservice ticket",
    },
  },
  get_ticket_read_fields: {
    description:
      "Lists available Freshservice ticket field ids for use in the get_ticket.fields parameter (read-time).",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice ticket read fields",
      done: "Get Freshservice ticket read fields",
    },
  },
  get_ticket_write_fields: {
    description:
      "Lists all available ticket fields including standard and custom fields. Use this to discover what fields are available for use in create_ticket, update_ticket, and other operations.",
    schema: {
      search: z
        .string()
        .optional()
        .describe("Search term to filter fields by name or label"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice ticket write fields",
      done: "Get Freshservice ticket write fields",
    },
  },
  create_ticket: {
    description:
      "Creates a new ticket in Freshservice. You MUST call get_ticket_write_fields first to get required fields, then provide all required field values in the custom_fields parameter.",
    schema: {
      email: z.string().describe("Requester email address"),
      subject: z.string().describe("Ticket subject"),
      description: z.string().describe("Ticket description"),
      priority: z
        .enum(["1", "2", "3", "4"])
        .optional()
        .describe("Priority: 1=Low, 2=Medium, 3=High, 4=Urgent"),
      status: z
        .enum(["2", "3", "4", "5"])
        .optional()
        .describe("Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed"),
      type: z.string().optional().describe("Ticket type"),
      tags: z.array(z.string()).optional().describe("Tags for the ticket"),
      custom_fields: z
        .record(z.any())
        .optional()
        .describe("Custom field values"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Freshservice ticket",
      done: "Create Freshservice ticket",
    },
  },
  update_ticket: {
    description: "Updates an existing ticket in Freshservice",
    schema: {
      ticket_id: z.string().describe("Ticket ID to update"),
      subject: z.string().optional().describe("Updated ticket subject"),
      description: z.string().optional().describe("Updated ticket description"),
      priority: z
        .enum(["1", "2", "3", "4"])
        .optional()
        .describe("Priority: 1=Low, 2=Medium, 3=High, 4=Urgent"),
      status: z
        .enum(["2", "3", "4", "5"])
        .optional()
        .describe("Status: 2=Open, 3=Pending, 4=Resolved, 5=Closed"),
      tags: z.array(z.string()).optional().describe("Ticket tags"),
      custom_fields: z
        .record(z.any())
        .optional()
        .describe("Custom field values"),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Freshservice ticket",
      done: "Update Freshservice ticket",
    },
  },
  add_ticket_note: {
    description: "Adds a note to an existing ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      body: z.string().describe("Content of the note in HTML format"),
      private: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether the note is private"),
    },
    stake: "low",
    displayLabels: {
      running: "Adding note to Freshservice ticket",
      done: "Add note to Freshservice ticket",
    },
  },
  add_ticket_reply: {
    description: "Adds a reply to a ticket conversation",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      body: z.string().describe("Content of the note in HTML format"),
    },
    stake: "low",
    displayLabels: {
      running: "Adding reply to Freshservice ticket",
      done: "Add reply to Freshservice ticket",
    },
  },

  // Ticket tasks
  list_ticket_tasks: {
    description: "Lists all tasks associated with a ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice ticket tasks",
      done: "List Freshservice ticket tasks",
    },
  },
  get_ticket_task: {
    description: "Gets detailed information about a specific task on a ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      task_id: z.number().describe("The ID of the task"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice ticket task",
      done: "Get Freshservice ticket task",
    },
  },
  create_ticket_task: {
    description:
      "Creates a new task on a ticket. Tasks help break down complex tickets into manageable subtasks.",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      status: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Status: 1=Open, 2=In Progress, 3=Completed"),
      due_date: z.string().optional().describe("Due date in ISO 8601 format"),
      notify_before: z
        .number()
        .optional()
        .describe("Number of hours before due date to send notification"),
      agent_id: z
        .number()
        .optional()
        .describe("Agent ID to assign the task to"),
      group_id: z
        .number()
        .optional()
        .describe("Group ID to assign the task to"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Freshservice ticket task",
      done: "Create Freshservice ticket task",
    },
  },
  update_ticket_task: {
    description: "Updates an existing task on a ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      task_id: z.number().describe("The ID of the task to update"),
      title: z.string().optional().describe("Updated task title"),
      description: z.string().optional().describe("Updated task description"),
      status: z
        .enum(["1", "2", "3"])
        .optional()
        .describe("Updated status: 1=Open, 2=In Progress, 3=Completed"),
      due_date: z
        .string()
        .optional()
        .describe("Updated due date in ISO 8601 format"),
      notify_before: z
        .number()
        .optional()
        .describe("Updated notification time (hours before due date)"),
      agent_id: z
        .number()
        .optional()
        .describe("Updated agent ID to assign the task to"),
      group_id: z
        .number()
        .optional()
        .describe("Updated group ID to assign the task to"),
    },
    stake: "low",
    displayLabels: {
      running: "Updating Freshservice ticket task",
      done: "Update Freshservice ticket task",
    },
  },
  delete_ticket_task: {
    description: "Deletes a task from a ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      task_id: z.number().describe("The ID of the task to delete"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting Freshservice ticket task",
      done: "Delete Freshservice ticket task",
    },
  },

  // Ticket approvals
  get_ticket_approval: {
    description: "Gets detailed information about a specific ticket approval",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      approval_id: z.number().describe("The ID of the approval to retrieve"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice ticket approval",
      done: "Get Freshservice ticket approval",
    },
  },
  list_ticket_approvals: {
    description: "Lists all approvals for a specific ticket",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice ticket approvals",
      done: "List Freshservice ticket approvals",
    },
  },
  request_service_approval: {
    description:
      "Requests approval for a ticket. This creates an approval request that needs to be approved before the ticket can be fulfilled. Only works on tickets that have approval workflow configured.",
    schema: {
      ticket_id: z.number().describe("The ID of the ticket"),
      approver_id: z
        .number()
        .describe("The ID of the user who should approve this request"),
      approval_type: z
        .enum(["1", "2"])
        .describe(
          "Approval type: 1=Everyone must approve, 2=Anyone can approve"
        ),
      email_content: z
        .string()
        .optional()
        .describe(
          "Custom email content for approval notification. If not provided, default notification will be sent."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Requesting Freshservice approval",
      done: "Request Freshservice approval",
    },
  },

  // Departments, Products, On-call schedules
  list_departments: {
    description: "Lists all departments in Freshservice",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice departments",
      done: "List Freshservice departments",
    },
  },
  list_products: {
    description: "Lists all products in Freshservice",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice products",
      done: "List Freshservice products",
    },
  },
  list_oncall_schedules: {
    description: "Lists on-call schedules",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice on-call schedules",
      done: "List Freshservice on-call schedules",
    },
  },

  // Service catalog
  list_service_categories: {
    description:
      "Lists service catalog categories. Use this first to get category IDs for filtering service items.",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice service categories",
      done: "List Freshservice service categories",
    },
  },
  list_service_items: {
    description:
      "Lists service catalog items. To filter by category: 1) Use list_service_categories to get category IDs, 2) Use the category_id parameter here.",
    schema: {
      category_id: z
        .number()
        .optional()
        .describe(
          "Filter by category ID - use list_service_categories to get available category IDs"
        ),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice service items",
      done: "List Freshservice service items",
    },
  },
  search_service_items: {
    description:
      "Searches for service items from the service catalog for a given search term. Only use this when specifically searching for items by keyword.",
    schema: {
      search_term: z
        .string()
        .describe(
          "The keywords for which the service items have to be searched (e.g. 'VPN issue', 'Adobe')"
        ),
      workspace_id: z
        .number()
        .optional()
        .describe(
          "ID of the workspace to which the service item belongs. Applicable only to accounts on Employee Support Mode."
        ),
      user_email: z
        .string()
        .email()
        .optional()
        .describe(
          "By default, the API will search items for the user whose API key is provided. If you want to search items for a different user, provide their user_email."
        ),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching Freshservice service items",
      done: "Search Freshservice service items",
    },
  },
  get_service_item: {
    description:
      "Gets detailed information about a specific service catalog item including fields and pricing",
    schema: {
      display_id: z
        .number()
        .describe("The display ID of the service catalog item"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice service item",
      done: "Get Freshservice service item",
    },
  },
  get_service_item_fields: {
    description:
      "Gets the field configuration for a service catalog item. You must call this before request_service_item to get required fields. Returns required_fields and hidden_required_fields that must be provided.",
    schema: {
      display_id: z
        .number()
        .describe("The display ID of the service catalog item"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice service item fields",
      done: "Get Freshservice service item fields",
    },
  },
  request_service_item: {
    description:
      "Creates a service request for a catalog item. This creates a new ticket. You MUST call get_service_item_fields first to get required fields, then provide all required field values in the fields parameter.",
    schema: {
      display_id: z
        .number()
        .describe("The display ID of the service catalog item to request"),
      email: z.string().describe("Requester email address"),
      quantity: z.number().optional().describe("Quantity of items to request"),
      requested_for: z
        .string()
        .optional()
        .describe(
          "Email of the person this is requested for (if different from requester)"
        ),
      fields: z
        .record(z.any())
        .optional()
        .describe("Custom field values for the service request form"),
      ticket_id: z
        .number()
        .optional()
        .describe("Optional ticket ID to attach this service request to"),
    },
    stake: "low",
    displayLabels: {
      running: "Requesting Freshservice service item",
      done: "Request Freshservice service item",
    },
  },

  // Solutions (Knowledge Base)
  list_solution_categories: {
    description:
      "Lists solution categories. These are used to organize solution folders, which are mandatory for ticket listing.",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice solution categories",
      done: "List Freshservice solution categories",
    },
  },
  list_solution_folders: {
    description:
      "Lists solution folders within categories. Solution folders are mandatory for ticket listing. Use list_solution_categories first to get category IDs, then filter folders by category_id.",
    schema: {
      category_id: z.number().optional().describe("Filter by category ID"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice solution folders",
      done: "List Freshservice solution folders",
    },
  },
  list_solution_articles: {
    description:
      "Lists solution articles within a specific folder (returns metadata only, use get_solution_article for full content). To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    schema: {
      folder_id: z
        .number()
        .describe(
          "Folder ID (required) - use list_solution_folders to get available folder IDs"
        ),
      category_id: z
        .number()
        .optional()
        .describe("Filter by category ID (optional additional filter)"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice solution articles",
      done: "List Freshservice solution articles",
    },
  },
  get_solution_article: {
    description:
      "Gets detailed information about a specific solution article including its full content",
    schema: {
      article_id: z.number().describe("The ID of the solution article"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice solution article",
      done: "Get Freshservice solution article",
    },
  },
  create_solution_article: {
    description:
      "Creates a new solution article in a specific folder. To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    schema: {
      title: z.string().describe("Article title"),
      description: z.string().describe("Article content"),
      folder_id: z
        .number()
        .describe(
          "Folder ID to place the article in (required) - use list_solution_folders to get available folder IDs"
        ),
      status: z
        .enum(["1", "2"])
        .optional()
        .describe("Status: 1=Draft, 2=Published"),
      tags: z.array(z.string()).optional().describe("Tags for the article"),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Freshservice solution article",
      done: "Create Freshservice solution article",
    },
  },

  // Requesters
  list_requesters: {
    description: "Lists requesters",
    schema: {
      email: z.string().optional().describe("Filter by email"),
      mobile: z.string().optional().describe("Filter by mobile"),
      phone: z.string().optional().describe("Filter by phone"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice requesters",
      done: "List Freshservice requesters",
    },
  },
  get_requester: {
    description: "Gets detailed information about a specific requester",
    schema: {
      requester_id: z.number().describe("The ID of the requester"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice requester",
      done: "Get Freshservice requester",
    },
  },

  // Purchase Orders
  list_purchase_orders: {
    description: "Lists purchase orders",
    schema: {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice purchase orders",
      done: "List Freshservice purchase orders",
    },
  },

  // SLA Policies
  list_sla_policies: {
    description: "Lists SLA policies",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice SLA policies",
      done: "List Freshservice SLA policies",
    },
  },

  // Canned responses
  list_canned_responses: {
    description: "Lists all canned responses available in Freshservice",
    schema: {
      search: z
        .string()
        .optional()
        .describe("Search term to filter canned responses by name or content"),
      category_id: z.number().optional().describe("Filter by category ID"),
      folder_id: z.number().optional().describe("Filter by folder ID"),
      is_public: z
        .boolean()
        .optional()
        .describe("Filter by public/private status"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Freshservice canned responses",
      done: "List Freshservice canned responses",
    },
  },
  get_canned_response: {
    description: "Gets detailed information about a specific canned response",
    schema: {
      response_id: z.number().describe("The ID of the canned response"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Freshservice canned response",
      done: "Get Freshservice canned response",
    },
  },
});

export const FRESHSERVICE_SERVER = {
  serverInfo: {
    name: "freshservice",
    version: "1.0.0",
    description: "Connect to tickets, schedules and service catalog.",
    authorization: {
      provider: "freshservice" as const,
      supported_use_cases: ["platform_actions", "personal_actions"] as const,
    },
    icon: "FreshserviceLogo",
    documentationUrl: "https://docs.dust.tt/docs/freshservice",
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    instructions: FRESHSERVICE_SERVER_INSTRUCTIONS,
  },
  tools: Object.values(FRESHSERVICE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FRESHSERVICE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
