import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  FreshserviceServiceItemField,
  FreshserviceTicket,
  FreshserviceTicketField,
} from "@app/lib/actions/mcp_internal_actions/servers/freshservice/freshservice_api_helper";
import { FreshserviceTicketSchema } from "@app/lib/actions/mcp_internal_actions/servers/freshservice/freshservice_api_helper";
import {
  addTicketNoteSchema,
  addTicketReplySchema,
  ALLOWED_TICKET_INCLUDES,
  createSolutionArticleSchema,
  createTicketSchema,
  createTicketTaskSchema,
  deleteTicketTaskSchema,
  FRESHSERVICE_TOOL_NAME,
  getCannedResponseSchema,
  getRequesterSchema,
  getServiceItemFieldsSchema,
  getServiceItemSchema,
  getSolutionArticleSchema,
  getTicketApprovalSchema,
  getTicketReadFieldsSchema,
  getTicketSchema,
  getTicketTaskSchema,
  getTicketWriteFieldsSchema,
  listCannedResponsesSchema,
  listDepartmentsSchema,
  listOncallSchedulesSchema,
  listProductsSchema,
  listPurchaseOrdersSchema,
  listRequestersSchema,
  listServiceCategoriesSchema,
  listServiceItemsSchema,
  listSlaPoliciesSchema,
  listSolutionArticlesSchema,
  listSolutionCategoriesSchema,
  listSolutionFoldersSchema,
  listTicketApprovalsSchema,
  listTicketsSchema,
  listTicketTasksSchema,
  requestServiceApprovalSchema,
  requestServiceItemSchema,
  searchServiceItemsSchema,
  updateTicketSchema,
  updateTicketTaskSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/freshservice/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("freshservice");

  // Helper function to make authenticated API calls
  const withAuth = async ({
    action,
    authInfo,
  }: {
    action: (
      accessToken: string,
      freshserviceDomain: string
    ) => Promise<Result<CallToolResult["content"], MCPError>>;
    authInfo?: { token?: string; extra?: Record<string, unknown> };
  }): Promise<Result<CallToolResult["content"], MCPError>> => {
    if (!authInfo?.token) {
      return new Err(
        new MCPError(
          "Authentication required. Please connect your Freshservice account."
        )
      );
    }

    // Extract Freshservice domain from extra metadata
    const freshserviceDomain = authInfo.extra?.freshservice_domain as string;
    if (!freshserviceDomain) {
      return new Err(
        new MCPError(
          "Freshservice domain URL not configured. Please reconnect your Freshservice account."
        )
      );
    }

    try {
      return await action(authInfo.token, freshserviceDomain);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
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

    // eslint-disable-next-line no-restricted-globals
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
    listTicketsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const tickets: FreshserviceTicket[] = result.tickets || [];
            const selectedFields: ReadonlyArray<string> =
              fields && fields.length > 0 ? fields : DEFAULT_TICKET_FIELDS_LIST;
            const filteredTickets = tickets.map((ticket) =>
              pickFields(ticket, selectedFields)
            );

            return new Ok([
              {
                type: "text" as const,
                text: `Retrieved ${filteredTickets.length} tickets`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(filteredTickets, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_ticket",
    "Gets detailed information about a specific ticket. By default returns essential fields for performance, but you can specify specific fields.",
    getTicketSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Ticket retrieved successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(filteredTicket, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_ticket_read_fields",
    "Lists available Freshservice ticket field ids for use in the get_ticket.fields parameter (read-time).",
    getTicketReadFieldsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        return withAuth({
          action: async () => {
            // Currently static based on documentation. In the future, we can get this from the Freshservice API.
            // This will require additional authentication scopes, so avoiding in the short term.
            return new Ok([
              {
                type: "text" as const,
                text: "Base ticket field ids (without includes)",
              },
              {
                type: "text" as const,
                text: JSON.stringify(
                  FreshserviceTicketSchema.keyof().options,
                  null,
                  2
                ),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "create_ticket",
    "Creates a new ticket in Freshservice. You MUST call get_ticket_write_fields first to get required fields, then provide all required field values in the custom_fields parameter.",
    createTicketSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const fields = fieldsResult.fields || [];
            const requiredFields = fields.filter(
              (field: FreshserviceTicketField) => field.required
            );
            const providedFields = custom_fields ?? {};
            const missingRequiredFields = requiredFields.filter(
              (field: FreshserviceTicketField) =>
                !Object.prototype.hasOwnProperty.call(
                  providedFields,
                  field.name
                )
            );

            if (missingRequiredFields.length > 0) {
              return new Err(
                new MCPError(
                  `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceTicketField) => field.name).join(", ")}. Use get_ticket_write_fields to see all required fields.`
                )
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

            return new Ok([
              {
                type: "text" as const,
                text: `Ticket created successfully. View ticket at: ${ticketUrl}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(ticketUrl, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "update_ticket",
    "Updates an existing ticket in Freshservice",
    updateTicketSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Ticket updated successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.ticket, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "add_ticket_note",
    "Adds a note to an existing ticket",
    addTicketNoteSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Note added successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.conversation, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "add_ticket_reply",
    "Adds a reply to a ticket conversation",
    addTicketReplySchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Reply added successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.conversation, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_ticket_tasks",
    "Lists all tasks associated with a ticket",
    listTicketTasksSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticket_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `tickets/${ticket_id}/tasks`
            );

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.tasks?.length || 0} tasks for ticket ${ticket_id}`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.tasks || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_ticket_task",
    "Gets detailed information about a specific task on a ticket",
    getTicketTaskSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticket_id, task_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `tickets/${ticket_id}/tasks/${task_id}`
            );

            return new Ok([
              { type: "text" as const, text: "Task retrieved successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.task, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "create_ticket_task",
    "Creates a new task on a ticket. Tasks help break down complex tickets into manageable subtasks.",
    createTicketTaskSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Task created successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.task, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "update_ticket_task",
    "Updates an existing task on a ticket",
    updateTicketTaskSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Task updated successfully" },
              {
                type: "text" as const,
                text: JSON.stringify(result.task, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "delete_ticket_task",
    "Deletes a task from a ticket",
    deleteTicketTaskSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              { type: "text" as const, text: "Task deleted successfully" },
              {
                type: "text" as const,
                text: JSON.stringify({ deleted_task_id: task_id }, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Departments
  server.tool(
    "list_departments",
    "Lists all departments in Freshservice",
    listDepartmentsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.departments?.length || 0} departments`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.departments || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Products
  server.tool(
    "list_products",
    "Lists all products in Freshservice",
    listProductsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.products?.length || 0} products`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.products || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // On-call schedules
  server.tool(
    "list_oncall_schedules",
    "Lists on-call schedules",
    listOncallSchedulesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.oncall_schedules?.length || 0} on-call schedules`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.oncall_schedules || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Service catalog
  server.tool(
    "list_service_categories",
    "Lists service catalog categories. Use this first to get category IDs for filtering service items.",
    listServiceCategoriesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.service_categories?.length || 0} service categories`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.service_categories || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_service_items",
    "Lists service catalog items. To filter by category: 1) Use list_service_categories to get category IDs, 2) Use the category_id parameter here.",
    listServiceItemsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.service_items?.length || 0} service items`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.service_items || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "search_service_items",
    "Searches for service items from the service catalog for a given search term. Only use this when specifically searching for items by keyword.",
    searchServiceItemsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Found ${result.service_items?.length || 0} service items matching '${search_term}'`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.service_items || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_service_item",
    "Gets detailed information about a specific service catalog item including fields and pricing",
    getServiceItemSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ display_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `service_catalog/items/${display_id}`
            );

            return new Ok([
              {
                type: "text" as const,
                text: "Service item retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.service_item, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_service_item_fields",
    "Gets the field configuration for a service catalog item. You must call this before request_service_item to get required fields. Returns required_fields and hidden_required_fields that must be provided.",
    getServiceItemFieldsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const fields = serviceItem.custom_fields || [];
            const requiredFields = fields.filter(
              (field: FreshserviceServiceItemField) => field.required
            );

            return new Ok([
              {
                type: "text" as const,
                text: `Retrieved ${requiredFields.length} service item required fields for item ${display_id}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    fields,
                  },
                  null,
                  2
                ),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "request_service_item",
    "Creates a service request for a catalog item. This creates a new ticket. You MUST call get_service_item_fields first to get required fields, then provide all required field values in the fields parameter.",
    requestServiceItemSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            const customFields = serviceItem.custom_fields || [];

            const requiredFields = customFields.filter(
              (field: any) => field.required
            );
            const providedFields = fields ?? {};
            const missingRequiredFields = requiredFields.filter(
              (field: FreshserviceServiceItemField) =>
                !Object.prototype.hasOwnProperty.call(
                  providedFields,
                  field.name
                )
            );

            if (missingRequiredFields.length > 0) {
              return new Err(
                new MCPError(
                  `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceServiceItemField) => field.name).join(", ")}. Use get_service_item_fields to see all required fields.`
                )
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

            return new Ok([
              {
                type: "text" as const,
                text: `Service request created successfully. View ticket at: ${ticketUrl}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    service_request: serviceRequest,
                    ticket_id: serviceRequest.id,
                    ticket_url: ticketUrl,
                    service_item_name: serviceItem.name,
                  },
                  null,
                  2
                ),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Solutions (Knowledge Base)
  server.tool(
    "list_solution_categories",
    "Lists solution categories. These are used to organize solution folders, which are mandatory for ticket listing.",
    listSolutionCategoriesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.categories?.length || 0} solution categories`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.categories || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_solution_folders",
    "Lists solution folders within categories. Solution folders are mandatory for ticket listing. Use list_solution_categories first to get category IDs, then filter folders by category_id.",
    listSolutionFoldersSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.folders?.length || 0} solution folders`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.folders || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_solution_articles",
    "Lists solution articles within a specific folder (returns metadata only, use get_solution_article for full content). To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    listSolutionArticlesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

            return new Ok([
              {
                type: "text" as const,
                text: `Retrieved ${articlesMetadata.length} solution articles (metadata only)`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(articlesMetadata, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_solution_article",
    "Gets detailed information about a specific solution article including its full content",
    getSolutionArticleSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ article_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `solutions/articles/${article_id}`
            );

            return new Ok([
              {
                type: "text" as const,
                text: "Solution article retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.article, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "create_solution_article",
    "Creates a new solution article in a specific folder. To get folder_id: 1) Use list_solution_categories to get category IDs, 2) Use list_solution_folders with category_id to get folder IDs, 3) Use the folder_id here.",
    createSolutionArticleSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                text: "Solution article created successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.article, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Requesters
  server.tool(
    "list_requesters",
    "Lists requesters",
    listRequestersSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.requesters?.length || 0} requesters`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.requesters || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_requester",
    "Gets detailed information about a specific requester",
    getRequesterSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ requester_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `requesters/${requester_id}`
            );

            return new Ok([
              {
                type: "text" as const,
                text: "Requester retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.requester, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // Purchase Orders
  server.tool(
    "list_purchase_orders",
    "Lists purchase orders",
    listPurchaseOrdersSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.purchase_orders?.length || 0} purchase orders`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.purchase_orders || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  // SLA Policies
  server.tool(
    "list_sla_policies",
    "Lists SLA policies",
    listSlaPoliciesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async (_, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              "sla_policies"
            );

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.sla_policies?.length || 0} SLA policies`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.sla_policies || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_ticket_write_fields",
    "Lists all available ticket fields including standard and custom fields. Use this to discover what fields are available for use in create_ticket, update_ticket, and other operations.",
    getTicketWriteFieldsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ search }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              "ticket_form_fields"
            );

            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

            return new Ok([
              {
                type: "text" as const,
                text: `Retrieved ${filteredFields.length} ticket fields${search ? ` matching "${search}"` : ""}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    ticket_fields: filteredFields,
                    total_ticket_fields: filteredFields.length,
                  },
                  null,
                  2
                ),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_canned_responses",
    "Lists all canned responses available in Freshservice",
    listCannedResponsesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.canned_responses?.length || 0} canned responses`,
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.canned_responses || [], null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_canned_response",
    "Gets detailed information about a specific canned response",
    getCannedResponseSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ response_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `canned_responses/${response_id}`
            );

            return new Ok([
              {
                type: "text" as const,
                text: "Canned response retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.canned_response, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "get_ticket_approval",
    "Gets detailed information about a specific ticket approval",
    getTicketApprovalSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticket_id, approval_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `tickets/${ticket_id}/approvals/${approval_id}`
            );

            return new Ok([
              {
                type: "text" as const,
                text: "Ticket approval retrieved successfully",
              },
              {
                type: "text" as const,
                text: JSON.stringify(result.approval, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "list_ticket_approvals",
    "Lists all approvals for a specific ticket",
    listTicketApprovalsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ ticket_id }, { authInfo }) => {
        return withAuth({
          action: async (accessToken, freshserviceDomain) => {
            const result = await apiRequest(
              accessToken,
              freshserviceDomain,
              `tickets/${ticket_id}/approvals`
            );

            return new Ok([
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: `Retrieved ${result.approvals?.length || 0} approval(s) for ticket ${ticket_id}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    approvals: result.approvals || [],
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    total_approvals: result.approvals?.length || 0,
                  },
                  null,
                  2
                ),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  server.tool(
    "request_service_approval",
    "Requests approval for a ticket. This creates an approval request that needs to be approved before the ticket can be fulfilled. Only works on tickets that have approval workflow configured.",
    requestServiceApprovalSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: FRESHSERVICE_TOOL_NAME,
        agentLoopContext,
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
                return new Err(
                  new MCPError(
                    `Ticket ${ticket_id} does not support approvals. Approval actions can only be performed on tickets that have approval workflow configured.`
                  )
                );
              }
            } catch (error) {
              return new Err(
                new MCPError(
                  `Could not verify ticket ${ticket_id}: ${error instanceof Error ? error.message : "Unknown error"}`
                )
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

            return new Ok([
              {
                type: "text" as const,
                text: "Service request approval created successfully",
              },
              {
                type: "text" as const,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                text: JSON.stringify(result.approval || result, null, 2),
              },
            ]);
          },
          authInfo,
        });
      }
    )
  );

  return server;
}

export default createServer;
