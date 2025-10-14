import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";

import type {
  FreshserviceServiceItemField,
  FreshserviceTicket,
  FreshserviceTicketField,
} from "./freshservice_api_helper";
import { FreshserviceTicketSchema } from "./freshservice_api_helper";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("freshservice");

  // Helper function to make authenticated API calls
  const withAuth = async <T>({
    action,
    authInfo,
  }: {
    action: (accessToken: string, freshserviceDomain: string) => Promise<T>;
    authInfo?: { token?: string; extra?: Record<string, unknown> };
  }): Promise<T> => {
    if (!authInfo?.token) {
      return makeMCPToolTextError(
        "Authentication required. Please connect your Freshservice account."
      ) as T;
    }

    // Extract Freshservice domain from extra metadata
    const freshserviceDomain = authInfo.extra?.freshservice_domain as string;
    if (!freshserviceDomain) {
      return makeMCPToolTextError(
        "Freshservice domain URL not configured. Please reconnect your Freshservice account."
      ) as T;
    }

    try {
      return await action(authInfo.token, freshserviceDomain);
    } catch (error) {
      return makeMCPToolTextError(
        `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
      ) as T;
    }
  };

  // Helper function to normalize Freshservice domain for API calls
  const normalizeApiDomain = (freshserviceDomainRaw: string): string => {
    // Remove protocol, trailing slash, and trim whitespace
    const domain = freshserviceDomainRaw
      .trim() // Remove whitespace
      .replace(/^https?:\/\//, "") // Remove protocol
      .replace(/\/$/, ""); // Remove trailing slash

    if (!domain) {
      throw new Error("Invalid Freshservice domain format");
    }

    // If it already contains a dot (likely a full domain), use as-is
    if (domain.includes(".")) {
      return domain;
    }

    // If it's just the subdomain, add .freshservice.com
    return `${domain}.freshservice.com`;
  };

  // Helper function to make API requests
  const apiRequest = async (
    accessToken: string,
    freshserviceDomain: string,
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const apiDomain = normalizeApiDomain(freshserviceDomain);
    const url = `https://${apiDomain}/api/v2/${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    if (contentLength === "0" || !contentType) {
      return null;
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  };

  const DEFAULT_TICKET_FIELDS_LIST = [
    "id",
    "subject",
    "status",
  ] as const satisfies ReadonlyArray<keyof FreshserviceTicket>;

  const DEFAULT_TICKET_FIELDS_DETAIL = [
    "id",
    "subject",
    "description_text",
    "priority",
    "status",
    "requester_id",
    "responder_id",
    "department_id",
    "group_id",
    "type",
    "created_at",
    "updated_at",
    "due_by",
  ] as const satisfies ReadonlyArray<keyof FreshserviceTicket>;

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

  function pickFields(
    obj: unknown,
    fields: ReadonlyArray<string>
  ): Record<string, unknown> {
    const source = obj as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(source, field)) {
        result[field] = source[field];
      }
    }
    return result;
  }

  server.tool(
    "list_tickets",
    "Lists tickets with optional filtering and pagination. By default returns minimal fields (id, subject, status) for performance.",
    {
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
    async ({ filter, fields, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (filter?.email) {
            params.append("email", filter.email);
          }
          if (filter?.requester_id !== undefined) {
            params.append("requester_id", filter.requester_id.toString());
          }
          if (filter?.updated_since) {
            params.append("updated_since", filter.updated_since);
          }
          if (filter?.type) {
            params.append("type", filter.type);
          }
          if (filter?.filter_type) {
            params.append("filter", filter.filter_type);
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets?${params.toString()}`
          );

          // Filter fields if specified, otherwise use default fields
          const tickets: FreshserviceTicket[] = result.tickets || [];
          const selectedFields: ReadonlyArray<string> =
            fields && fields.length > 0 ? fields : DEFAULT_TICKET_FIELDS_LIST;
          const filteredTickets = tickets.map((ticket) =>
            pickFields(ticket, selectedFields)
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${filteredTickets.length} tickets`,
            result: filteredTickets,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket",
    "Gets detailed information about a specific ticket. By default returns essential fields for performance, but you can specify specific fields.",
    {
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
    async ({ ticket_id, fields, include }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams();
          if (include && include.length > 0) {
            // Filter to allowed just in case
            const validIncludes = include.filter((i) =>
              (ALLOWED_TICKET_INCLUDES as readonly string[]).includes(i)
            );
            if (validIncludes.length > 0) {
              params.set("include", validIncludes.join(","));
            }
          }
          const endpointBase = `tickets/${ticket_id}`;

          type TicketResult = { ticket: FreshserviceTicket };
          const queryString = params.toString();
          const endpoint = `${endpointBase}${queryString ? `?${queryString}` : ""}`;
          const result = (await apiRequest(
            accessToken,
            freshserviceDomain,
            endpoint
          )) as TicketResult;

          // Filter fields if specified, otherwise use default fields, but always preserve included keys
          const ticket = result.ticket as FreshserviceTicket;
          const baseSelected: ReadonlyArray<string> =
            fields && fields.length > 0
              ? fields
              : (DEFAULT_TICKET_FIELDS_DETAIL as ReadonlyArray<string>);
          const includeSelected: ReadonlyArray<string> = include ?? [];
          const unionSelected = Array.from(
            new Set([...baseSelected, ...includeSelected])
          );
          const filteredTicket = pickFields(ticket, unionSelected);

          return makeMCPToolJSONSuccess({
            message: "Ticket retrieved successfully",
            result: filteredTicket,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket_read_fields",
    "Lists available Freshservice ticket field ids for use in the get_ticket.fields parameter (read-time).",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async () => {
          // Currently static based on documentation. In the future, we can get this from the Freshservice API.
          // This will require additional authentication scopes, so avoiding in the short term.
          return makeMCPToolJSONSuccess({
            message: "Base ticket field ids (without includes)",
            result: FreshserviceTicketSchema.keyof().options,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_ticket",
    "Creates a new ticket in Freshservice. You MUST call get_ticket_write_fields first to get required fields, then provide all required field values in the custom_fields parameter.",
    {
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
    async (
      {
        email,
        subject,
        description,
        priority,
        status,
        type,
        tags,
        custom_fields,
      },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const fieldsResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            "ticket_form_fields"
          );

          const fields = fieldsResult.fields || [];
          const requiredFields = fields.filter(
            (field: FreshserviceTicketField) => field.required
          );
          const providedFields = custom_fields ?? {};
          const missingRequiredFields = requiredFields.filter(
            (field: FreshserviceTicketField) =>
              !Object.prototype.hasOwnProperty.call(providedFields, field.name)
          );

          if (missingRequiredFields.length > 0) {
            return makeMCPToolTextError(
              `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceTicketField) => field.name).join(", ")}. Use get_ticket_write_fields to see all required fields.`
            );
          }

          const ticketData: any = {
            email,
            subject,
            description,
            priority: priority ? parseInt(priority) : 2,
            status: status ? parseInt(status) : 2,
          };

          if (type) {
            ticketData.type = type;
          }
          if (tags) {
            ticketData.tags = tags;
          }
          if (custom_fields) {
            ticketData.custom_fields = custom_fields;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            "tickets",
            {
              method: "POST",
              body: JSON.stringify(ticketData),
            }
          );

          const ticket = result.ticket;
          const apiDomain = normalizeApiDomain(freshserviceDomain);
          const ticketUrl = `https://${apiDomain}/support/tickets/${ticket.id}`;

          return makeMCPToolJSONSuccess({
            message: `Ticket created successfully. View ticket at: ${ticketUrl}`,
            result: ticketUrl,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_ticket",
    "Updates an existing ticket in Freshservice",
    {
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
    async (
      {
        ticket_id,
        subject,
        description,
        priority,
        status,
        tags,
        custom_fields,
      },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const updateData: any = {};

          if (subject) {
            updateData.subject = subject;
          }
          if (description) {
            updateData.description = description;
          }
          if (priority) {
            updateData.priority = parseInt(priority);
          }
          if (status) {
            updateData.status = parseInt(status);
          }
          if (tags) {
            updateData.tags = tags;
          }
          if (custom_fields) {
            updateData.custom_fields = custom_fields;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}`,
            {
              method: "PUT",
              body: JSON.stringify(updateData),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Ticket updated successfully",
            result: result.ticket,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "add_ticket_note",
    "Adds a note to an existing ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      body: z.string().describe("Content of the note in HTML format"),
      private: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether the note is private"),
    },
    async ({ ticket_id, body, private: isPrivate }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/notes`,
            {
              method: "POST",
              body: JSON.stringify({
                body,
                private: isPrivate,
              }),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Note added successfully",
            result: result.conversation,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "add_ticket_reply",
    "Adds a reply to a ticket conversation",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      body: z.string().describe("Content of the note in HTML format"),
    },
    async ({ ticket_id, body }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/reply`,
            {
              method: "POST",
              body: JSON.stringify({
                body,
              }),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Reply added successfully",
            result: result.conversation,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_ticket_tasks",
    "Lists all tasks associated with a ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
    },
    async ({ ticket_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/tasks`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.tasks?.length || 0} tasks for ticket ${ticket_id}`,
            result: result.tasks || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket_task",
    "Gets detailed information about a specific task on a ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      task_id: z.number().describe("The ID of the task"),
    },
    async ({ ticket_id, task_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/tasks/${task_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Task retrieved successfully",
            result: result.task,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_ticket_task",
    "Creates a new task on a ticket. Tasks help break down complex tickets into manageable subtasks.",
    {
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
    async (
      {
        ticket_id,
        title,
        description,
        status,
        due_date,
        notify_before,
        agent_id,
        group_id,
      },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const taskData: any = {
            title,
            status: status ? parseInt(status) : 1,
          };

          if (description) {
            taskData.description = description;
          }
          if (due_date) {
            taskData.due_date = due_date;
          }
          if (notify_before !== undefined) {
            taskData.notify_before = notify_before;
          }
          if (agent_id) {
            taskData.agent_id = agent_id;
          }
          if (group_id) {
            taskData.group_id = group_id;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/tasks`,
            {
              method: "POST",
              body: JSON.stringify({
                task: taskData,
              }),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Task created successfully",
            result: result.task,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_ticket_task",
    "Updates an existing task on a ticket",
    {
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
    async (
      {
        ticket_id,
        task_id,
        title,
        description,
        status,
        due_date,
        notify_before,
        agent_id,
        group_id,
      },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const updateData: any = {};

          if (title) {
            updateData.title = title;
          }
          if (description) {
            updateData.description = description;
          }
          if (status) {
            updateData.status = parseInt(status);
          }
          if (due_date) {
            updateData.due_date = due_date;
          }
          if (notify_before !== undefined) {
            updateData.notify_before = notify_before;
          }
          if (agent_id !== undefined) {
            updateData.agent_id = agent_id;
          }
          if (group_id !== undefined) {
            updateData.group_id = group_id;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/tasks/${task_id}`,
            {
              method: "PUT",
              body: JSON.stringify({
                task: updateData,
              }),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Task updated successfully",
            result: result.task,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "delete_ticket_task",
    "Deletes a task from a ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      task_id: z.number().describe("The ID of the task to delete"),
    },
    async ({ ticket_id, task_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/tasks/${task_id}`,
            {
              method: "DELETE",
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Task deleted successfully",
            result: { deleted_task_id: task_id },
          });
        },
        authInfo,
      });
    }
  );

  // Departments
  server.tool(
    "list_departments",
    "Lists all departments in Freshservice",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `departments?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.departments?.length || 0} departments`,
            result: result.departments || [],
          });
        },
        authInfo,
      });
    }
  );

  // Products
  server.tool(
    "list_products",
    "Lists all products in Freshservice",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `products?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.products?.length || 0} products`,
            result: result.products || [],
          });
        },
        authInfo,
      });
    }
  );

  // On-call schedules
  server.tool(
    "list_oncall_schedules",
    "Lists on-call schedules",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `oncall_schedules?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.oncall_schedules?.length || 0} on-call schedules`,
            result: result.oncall_schedules || [],
          });
        },
        authInfo,
      });
    }
  );

  // Service catalog
  server.tool(
    "list_service_categories",
    "Lists service catalog categories. Use this first to get category IDs for filtering service items.",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/categories?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.service_categories?.length || 0} service categories`,
            result: result.service_categories || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_service_items",
    "Lists service catalog items. To filter by category: 1) Use list_service_categories to get category IDs, 2) Use the category_id parameter here.",
    {
      category_id: z
        .number()
        .optional()
        .describe(
          "Filter by category ID - use list_service_categories to get available category IDs"
        ),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ category_id, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (category_id) {
            params.append("category_id", category_id.toString());
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.service_items?.length || 0} service items`,
            result: result.service_items || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "search_service_items",
    "Searches for service items from the service catalog for a given search term. Only use this when specifically searching for items by keyword.",
    {
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
    async (
      { search_term, workspace_id, user_email, page, per_page },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            search_term,
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (workspace_id) {
            params.append("workspace_id", workspace_id.toString());
          }
          if (user_email) {
            params.append("user_email", user_email);
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/search?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Found ${result.service_items?.length || 0} service items matching '${search_term}'`,
            result: result.service_items || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_service_item",
    "Gets detailed information about a specific service catalog item including fields and pricing",
    {
      display_id: z
        .number()
        .describe("The display ID of the service catalog item"),
    },
    async ({ display_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${display_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Service item retrieved successfully",
            result: result.service_item,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_service_item_fields",
    "Gets the field configuration for a service catalog item. You must call this before request_service_item to get required fields. Returns required_fields and hidden_required_fields that must be provided.",
    {
      display_id: z
        .number()
        .describe("The display ID of the service catalog item"),
    },
    async ({ display_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const itemResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${display_id}`
          );

          const serviceItem = itemResult.service_item;
          const fields = serviceItem.custom_fields || [];
          const requiredFields = fields.filter(
            (field: FreshserviceServiceItemField) => field.required
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${requiredFields.length} service item required fields for item ${display_id}`,
            result: {
              fields,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "request_service_item",
    "Creates a service request for a catalog item. This creates a new ticket. You MUST call get_service_item_fields first to get required fields, then provide all required field values in the fields parameter.",
    {
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
    async (
      { display_id, email, quantity, requested_for, fields },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const itemResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${display_id}`
          );

          const serviceItem = itemResult.service_item;

          const customFields = serviceItem.custom_fields || [];

          const requiredFields = customFields.filter(
            (field: any) => field.required
          );
          const providedFields = fields ?? {};
          const missingRequiredFields = requiredFields.filter(
            (field: FreshserviceServiceItemField) =>
              !Object.prototype.hasOwnProperty.call(providedFields, field.name)
          );

          if (missingRequiredFields.length > 0) {
            return makeMCPToolTextError(
              `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceServiceItemField) => field.name).join(", ")}. Use get_service_item_fields to see all required fields.`
            );
          }

          const requestData: any = {
            email,
            custom_fields: fields ?? {},
          };

          if (quantity !== undefined) {
            requestData.quantity = quantity;
          }

          if (requested_for) {
            requestData.requested_for = requested_for;
          }

          // Create the service request
          const serviceRequestResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${display_id}/place_request`,
            {
              method: "POST",
              body: JSON.stringify(requestData),
            }
          );

          const serviceRequest = serviceRequestResult.service_request;
          const apiDomain = normalizeApiDomain(freshserviceDomain);
          const ticketUrl = `https://${apiDomain}/support/tickets/${serviceRequest.id}`;

          return makeMCPToolJSONSuccess({
            message: `Service request created successfully. View ticket at: ${ticketUrl}`,
            result: {
              service_request: serviceRequest,
              ticket_id: serviceRequest.id,
              ticket_url: ticketUrl,
              service_item_name: serviceItem.name,
            },
          });
        },
        authInfo,
      });
    }
  );

  // Solutions (Knowledge Base)
  server.tool(
    "list_solution_categories",
    "Lists solution categories. These are used to organize solution folders, which are mandatory for ticket listing.",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `solutions/categories?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.categories?.length || 0} solution categories`,
            result: result.categories || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_solution_folders",
    "Lists solution folders within categories. Solution folders are mandatory for ticket listing. Use list_solution_categories first to get category IDs, then filter folders by category_id.",
    {
      category_id: z.number().optional().describe("Filter by category ID"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ category_id, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (category_id) {
            params.append("category_id", category_id.toString());
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `solutions/folders?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.folders?.length || 0} solution folders`,
            result: result.folders || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_solution_articles",
    "Lists solution articles within a specific folder (returns metadata only, use get_solution_article for full content). To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    {
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
    async ({ folder_id, category_id, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
            folder_id: folder_id.toString(),
          });

          if (category_id) {
            params.append("category_id", category_id.toString());
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `solutions/articles?${params.toString()}`
          );

          // Filter out article content to reduce response size
          const articles = result.articles || [];
          const articlesMetadata = articles.map((article: any) => ({
            id: article.id,
            title: article.title,
            folder_id: article.folder_id,
            category_id: article.category_id,
            status: article.status,
            tags: article.tags,
            created_at: article.created_at,
            updated_at: article.updated_at,
            // Exclude description/description_text to reduce payload
          }));

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${articlesMetadata.length} solution articles (metadata only)`,
            result: articlesMetadata,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_solution_article",
    "Gets detailed information about a specific solution article including its full content",
    {
      article_id: z.number().describe("The ID of the solution article"),
    },
    async ({ article_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `solutions/articles/${article_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Solution article retrieved successfully",
            result: result.article,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_solution_article",
    "Creates a new solution article in a specific folder. To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    {
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
    async ({ title, description, folder_id, status, tags }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const articleData: any = {
            title,
            description,
            folder_id,
            status: status ? parseInt(status) : 1,
          };

          if (tags) {
            articleData.tags = tags;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            "solutions/articles",
            {
              method: "POST",
              body: JSON.stringify({
                article: articleData,
              }),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Solution article created successfully",
            result: result.article,
          });
        },
        authInfo,
      });
    }
  );

  // Requesters
  server.tool(
    "list_requesters",
    "Lists requesters",
    {
      email: z.string().optional().describe("Filter by email"),
      mobile: z.string().optional().describe("Filter by mobile"),
      phone: z.string().optional().describe("Filter by phone"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ email, mobile, phone, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (email) {
            params.append("email", email);
          }
          if (mobile) {
            params.append("mobile", mobile);
          }
          if (phone) {
            params.append("phone", phone);
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `requesters?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.requesters?.length || 0} requesters`,
            result: result.requesters || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_requester",
    "Gets detailed information about a specific requester",
    {
      requester_id: z.number().describe("The ID of the requester"),
    },
    async ({ requester_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `requesters/${requester_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Requester retrieved successfully",
            result: result.requester,
          });
        },
        authInfo,
      });
    }
  );

  // Purchase Orders
  server.tool(
    "list_purchase_orders",
    "Lists purchase orders",
    {
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `purchase_orders?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.purchase_orders?.length || 0} purchase orders`,
            result: result.purchase_orders || [],
          });
        },
        authInfo,
      });
    }
  );

  // SLA Policies
  server.tool(
    "list_sla_policies",
    "Lists SLA policies",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            "sla_policies"
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.sla_policies?.length || 0} SLA policies`,
            result: result.sla_policies || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket_write_fields",
    "Lists all available ticket fields including standard and custom fields. Use this to discover what fields are available for use in create_ticket, update_ticket, and other operations.",
    {
      search: z
        .string()
        .optional()
        .describe("Search term to filter fields by name or label"),
    },
    async ({ search }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            "ticket_form_fields"
          );

          const fields = result.ticket_fields || [];

          let filteredFields = fields;
          if (search) {
            const searchLower = search.toLowerCase();
            filteredFields = fields.filter(
              (field: FreshserviceTicketField) =>
                field.name?.toLowerCase().includes(searchLower) ||
                field.label?.toLowerCase().includes(searchLower) ||
                field.description?.toLowerCase().includes(searchLower)
            );
          }

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${filteredFields.length} ticket fields${search ? ` matching "${search}"` : ""}`,
            result: {
              ticket_fields: filteredFields,
              total_ticket_fields: filteredFields.length,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_canned_responses",
    "Lists all canned responses available in Freshservice",
    {
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
    async (
      { search, category_id, folder_id, is_public, page, per_page },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (search) {
            params.append("search", search);
          }
          if (category_id) {
            params.append("category_id", category_id.toString());
          }
          if (folder_id) {
            params.append("folder_id", folder_id.toString());
          }
          if (is_public !== undefined) {
            params.append("is_public", is_public.toString());
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `canned_responses?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.canned_responses?.length || 0} canned responses`,
            result: result.canned_responses || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_canned_response",
    "Gets detailed information about a specific canned response",
    {
      response_id: z.number().describe("The ID of the canned response"),
    },
    async ({ response_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `canned_responses/${response_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Canned response retrieved successfully",
            result: result.canned_response,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket_approval",
    "Gets detailed information about a specific ticket approval",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      approval_id: z.number().describe("The ID of the approval to retrieve"),
    },
    async ({ ticket_id, approval_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/approvals/${approval_id}`
          );

          return makeMCPToolJSONSuccess({
            message: "Ticket approval retrieved successfully",
            result: result.approval,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "list_ticket_approvals",
    "Lists all approvals for a specific ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
    },
    async ({ ticket_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/approvals`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.approvals?.length || 0} approval(s) for ticket ${ticket_id}`,
            result: {
              approvals: result.approvals || [],
              total_approvals: result.approvals?.length || 0,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "request_service_approval",
    "Requests approval for a ticket. This creates an approval request that needs to be approved before the ticket can be fulfilled. Only works on tickets that have approval workflow configured.",
    {
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
    async (
      { ticket_id, approver_id, approval_type, email_content },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          try {
            const ticketResult = await apiRequest(
              accessToken,
              freshserviceDomain,
              `tickets/${ticket_id}`
            );

            const ticket = ticketResult.ticket;

            if (
              ticket.approval_status === undefined &&
              ticket.approval_status_name === undefined
            ) {
              return makeMCPToolTextError(
                `Ticket ${ticket_id} does not support approvals. Approval actions can only be performed on tickets that have approval workflow configured.`
              );
            }
          } catch (error) {
            return makeMCPToolTextError(
              `Could not verify ticket ${ticket_id}: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }

          const approvalData: any = {
            approver_id,
            approval_type: parseInt(approval_type),
          };

          if (email_content) {
            approvalData.email_content = email_content;
          }

          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `tickets/${ticket_id}/approvals`,
            {
              method: "POST",
              body: JSON.stringify(approvalData),
            }
          );

          return makeMCPToolJSONSuccess({
            message: "Service request approval created successfully",
            result: result.approval || result,
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
