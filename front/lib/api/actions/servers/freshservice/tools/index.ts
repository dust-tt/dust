import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createFreshserviceClient } from "@app/lib/api/actions/servers/freshservice/client";
import { pickFields } from "@app/lib/api/actions/servers/freshservice/helpers";
import { FRESHSERVICE_TOOLS_METADATA } from "@app/lib/api/actions/servers/freshservice/metadata";
import type {
  FreshserviceServiceItemField,
  FreshserviceTicket,
  FreshserviceTicketField,
} from "@app/lib/api/actions/servers/freshservice/types";
import {
  DEFAULT_TICKET_FIELDS_DETAIL,
  DEFAULT_TICKET_FIELDS_LIST,
  FreshserviceTicketSchema,
} from "@app/lib/api/actions/servers/freshservice/types";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof FRESHSERVICE_TOOLS_METADATA> = {
  list_tickets: async ({ filter, fields, page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
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

      const result = await client.request<{ tickets: FreshserviceTicket[] }>(
        `tickets?${params.toString()}`
      );

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const tickets: FreshserviceTicket[] = result?.tickets || [];
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
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_ticket: async ({ ticket_id, fields, include }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams();
      if (include && include.length > 0) {
        params.set("include", include.join(","));
      }

      const queryString = params.toString();
      const endpoint = `tickets/${ticket_id}${queryString ? `?${queryString}` : ""}`;
      const result = await client.request<{ ticket: FreshserviceTicket }>(
        endpoint
      );

      const ticket = result?.ticket;
      if (!ticket) {
        return new Err(new MCPError("Ticket not found"));
      }

      // Filter fields if specified, otherwise use default fields, but always preserve included keys
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
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_ticket_read_fields: async (_, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }

    return new Ok([
      {
        type: "text" as const,
        text: "Base ticket field ids (without includes)",
      },
      {
        type: "text" as const,
        text: JSON.stringify(FreshserviceTicketSchema.keyof().options, null, 2),
      },
    ]);
  },

  get_ticket_write_fields: async ({ search }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{
        ticket_fields: FreshserviceTicketField[];
      }>("ticket_form_fields");

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const fields = result?.ticket_fields || [];

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
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  create_ticket: async (
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
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const fieldsResult = await client.request<{
        fields: FreshserviceTicketField[];
      }>("ticket_form_fields");

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const fields = fieldsResult?.fields || [];
      const requiredFields = fields.filter(
        (field: FreshserviceTicketField) => field.required
      );
      const providedFields = custom_fields ?? {};
      const missingRequiredFields = requiredFields.filter(
        (field: FreshserviceTicketField) =>
          !Object.prototype.hasOwnProperty.call(providedFields, field.name)
      );

      if (missingRequiredFields.length > 0) {
        return new Err(
          new MCPError(
            `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceTicketField) => field.name).join(", ")}. Use get_ticket_write_fields to see all required fields.`
          )
        );
      }

      const ticketData: Record<string, unknown> = {
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

      const result = await client.request<{
        ticket: { id: number };
      }>("tickets", {
        method: "POST",
        body: JSON.stringify(ticketData),
      });

      const ticket = result?.ticket;
      const apiDomain = client.getApiDomain();
      const ticketUrl = `https://${apiDomain}/support/tickets/${ticket?.id}`;

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
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  update_ticket: async (
    { ticket_id, subject, description, priority, status, tags, custom_fields },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const updateData: Record<string, unknown> = {};

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

      const result = await client.request<{ ticket: FreshserviceTicket }>(
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
          text: JSON.stringify(result?.ticket, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  add_ticket_note: async (
    { ticket_id, body, private: isPrivate },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ conversation: unknown }>(
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
          text: JSON.stringify(result?.conversation, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  add_ticket_reply: async ({ ticket_id, body }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ conversation: unknown }>(
        `tickets/${ticket_id}/reply`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        }
      );

      return new Ok([
        { type: "text" as const, text: "Reply added successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(result?.conversation, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_ticket_tasks: async ({ ticket_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ tasks: unknown[] }>(
        `tickets/${ticket_id}/tasks`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.tasks?.length || 0} tasks for ticket ${ticket_id}`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.tasks || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_ticket_task: async ({ ticket_id, task_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ task: unknown }>(
        `tickets/${ticket_id}/tasks/${task_id}`
      );

      return new Ok([
        { type: "text" as const, text: "Task retrieved successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(result?.task, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  create_ticket_task: async (
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
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const taskData: Record<string, unknown> = {
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

      const result = await client.request<{ task: unknown }>(
        `tickets/${ticket_id}/tasks`,
        {
          method: "POST",
          body: JSON.stringify({ task: taskData }),
        }
      );

      return new Ok([
        { type: "text" as const, text: "Task created successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(result?.task, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  update_ticket_task: async (
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
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const updateData: Record<string, unknown> = {};

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

      const result = await client.request<{ task: unknown }>(
        `tickets/${ticket_id}/tasks/${task_id}`,
        {
          method: "PUT",
          body: JSON.stringify({ task: updateData }),
        }
      );

      return new Ok([
        { type: "text" as const, text: "Task updated successfully" },
        {
          type: "text" as const,
          text: JSON.stringify(result?.task, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  delete_ticket_task: async ({ ticket_id, task_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      await client.request(`tickets/${ticket_id}/tasks/${task_id}`, {
        method: "DELETE",
      });

      return new Ok([
        { type: "text" as const, text: "Task deleted successfully" },
        {
          type: "text" as const,
          text: JSON.stringify({ deleted_task_id: task_id }, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_ticket_approval: async ({ ticket_id, approval_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ approval: unknown }>(
        `tickets/${ticket_id}/approvals/${approval_id}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Ticket approval retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.approval, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_ticket_approvals: async ({ ticket_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ approvals: unknown[] }>(
        `tickets/${ticket_id}/approvals`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.approvals?.length || 0} approval(s) for ticket ${ticket_id}`,
        },
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              approvals: result?.approvals || [],
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              total_approvals: result?.approvals?.length || 0,
            },
            null,
            2
          ),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  request_service_approval: async (
    { ticket_id, approver_id, approval_type, email_content },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      // Check if ticket supports approvals
      const ticketResult = await client.request<{
        ticket: {
          approval_status?: number;
          approval_status_name?: string;
        };
      }>(`tickets/${ticket_id}`);

      const ticket = ticketResult?.ticket;
      if (
        ticket?.approval_status === undefined &&
        ticket?.approval_status_name === undefined
      ) {
        return new Err(
          new MCPError(
            `Ticket ${ticket_id} does not support approvals. Approval actions can only be performed on tickets that have approval workflow configured.`
          )
        );
      }

      const approvalData: Record<string, unknown> = {
        approver_id,
        approval_type: parseInt(approval_type),
      };

      if (email_content) {
        approvalData.email_content = email_content;
      }

      const result = await client.request<{ approval: unknown }>(
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
          text: JSON.stringify(result?.approval || result, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_departments: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ departments: unknown[] }>(
        `departments?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.departments?.length || 0} departments`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.departments || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_products: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ products: unknown[] }>(
        `products?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.products?.length || 0} products`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.products || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_oncall_schedules: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ oncall_schedules: unknown[] }>(
        `oncall_schedules?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.oncall_schedules?.length || 0} on-call schedules`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.oncall_schedules || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_service_categories: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ service_categories: unknown[] }>(
        `service_catalog/categories?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.service_categories?.length || 0} service categories`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.service_categories || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_service_items: async ({ category_id, page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      if (category_id) {
        params.append("category_id", category_id.toString());
      }

      const result = await client.request<{ service_items: unknown[] }>(
        `service_catalog/items?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.service_items?.length || 0} service items`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.service_items || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  search_service_items: async (
    { search_term, workspace_id, user_email, page, per_page },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
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

      const result = await client.request<{ service_items: unknown[] }>(
        `service_catalog/items/search?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Found ${result?.service_items?.length || 0} service items matching '${search_term}'`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.service_items || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_service_item: async ({ display_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ service_item: unknown }>(
        `service_catalog/items/${display_id}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Service item retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.service_item, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_service_item_fields: async ({ display_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const itemResult = await client.request<{
        service_item: {
          custom_fields?: FreshserviceServiceItemField[];
        };
      }>(`service_catalog/items/${display_id}`);

      const serviceItem = itemResult?.service_item;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const fields = serviceItem?.custom_fields || [];
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
          text: JSON.stringify({ fields }, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  request_service_item: async (
    { display_id, email, quantity, requested_for, fields },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const itemResult = await client.request<{
        service_item: {
          name: string;
          custom_fields?: FreshserviceServiceItemField[];
        };
      }>(`service_catalog/items/${display_id}`);

      const serviceItem = itemResult?.service_item;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const customFields = serviceItem?.custom_fields || [];

      const requiredFields = customFields.filter(
        (field: FreshserviceServiceItemField) => field.required
      );
      const providedFields = fields ?? {};
      const missingRequiredFields = requiredFields.filter(
        (field: FreshserviceServiceItemField) =>
          !Object.prototype.hasOwnProperty.call(providedFields, field.name)
      );

      if (missingRequiredFields.length > 0) {
        return new Err(
          new MCPError(
            `Missing the following required fields: ${missingRequiredFields.map((field: FreshserviceServiceItemField) => field.name).join(", ")}. Use get_service_item_fields to see all required fields.`
          )
        );
      }

      const requestData: Record<string, unknown> = {
        email,
        custom_fields: fields ?? {},
      };

      if (quantity !== undefined) {
        requestData.quantity = quantity;
      }

      if (requested_for) {
        requestData.requested_for = requested_for;
      }

      const serviceRequestResult = await client.request<{
        service_request: { id: number };
      }>(`service_catalog/items/${display_id}/place_request`, {
        method: "POST",
        body: JSON.stringify(requestData),
      });

      const serviceRequest = serviceRequestResult?.service_request;
      const apiDomain = client.getApiDomain();
      const ticketUrl = `https://${apiDomain}/support/tickets/${serviceRequest?.id}`;

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
              ticket_id: serviceRequest?.id,
              ticket_url: ticketUrl,
              service_item_name: serviceItem?.name,
            },
            null,
            2
          ),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_solution_categories: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ categories: unknown[] }>(
        `solutions/categories?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.categories?.length || 0} solution categories`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.categories || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_solution_folders: async (
    { category_id, page, per_page },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      if (category_id) {
        params.append("category_id", category_id.toString());
      }

      const result = await client.request<{ folders: unknown[] }>(
        `solutions/folders?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.folders?.length || 0} solution folders`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.folders || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_solution_articles: async (
    { folder_id, category_id, page, per_page },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
        folder_id: folder_id.toString(),
      });

      if (category_id) {
        params.append("category_id", category_id.toString());
      }

      const result = await client.request<{
        articles: Array<{
          id: number;
          title: string;
          folder_id: number;
          category_id?: number;
          status: number;
          tags?: string[];
          created_at: string;
          updated_at: string;
        }>;
      }>(`solutions/articles?${params.toString()}`);

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const articles = result?.articles || [];
      const articlesMetadata = articles.map((article) => ({
        id: article.id,
        title: article.title,
        folder_id: article.folder_id,
        category_id: article.category_id,
        status: article.status,
        tags: article.tags,
        created_at: article.created_at,
        updated_at: article.updated_at,
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
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_solution_article: async ({ article_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ article: unknown }>(
        `solutions/articles/${article_id}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Solution article retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.article, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  create_solution_article: async (
    { title, description, folder_id, status, tags },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const articleData: Record<string, unknown> = {
        title,
        description,
        folder_id,
        status: status ? parseInt(status) : 1,
      };

      if (tags) {
        articleData.tags = tags;
      }

      const result = await client.request<{ article: unknown }>(
        "solutions/articles",
        {
          method: "POST",
          body: JSON.stringify({ article: articleData }),
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Solution article created successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.article, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_requesters: async (
    { email, mobile, phone, page, per_page },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
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

      const result = await client.request<{ requesters: unknown[] }>(
        `requesters?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.requesters?.length || 0} requesters`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.requesters || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_requester: async ({ requester_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ requester: unknown }>(
        `requesters/${requester_id}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Requester retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.requester, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_purchase_orders: async ({ page, per_page }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: per_page.toString(),
      });

      const result = await client.request<{ purchase_orders: unknown[] }>(
        `purchase_orders?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.purchase_orders?.length || 0} purchase orders`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.purchase_orders || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_sla_policies: async (_, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ sla_policies: unknown[] }>(
        "sla_policies"
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.sla_policies?.length || 0} SLA policies`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.sla_policies || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  list_canned_responses: async (
    { search, category_id, folder_id, is_public, page, per_page },
    { authInfo }
  ) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
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

      const result = await client.request<{ canned_responses: unknown[] }>(
        `canned_responses?${params.toString()}`
      );

      return new Ok([
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: `Retrieved ${result?.canned_responses?.length || 0} canned responses`,
        },
        {
          type: "text" as const,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          text: JSON.stringify(result?.canned_responses || [], null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },

  get_canned_response: async ({ response_id }, { authInfo }) => {
    const clientResult = createFreshserviceClient(authInfo);
    if (clientResult.isErr()) {
      return clientResult;
    }
    const client = clientResult.value;

    try {
      const result = await client.request<{ canned_response: unknown }>(
        `canned_responses/${response_id}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: "Canned response retrieved successfully",
        },
        {
          type: "text" as const,
          text: JSON.stringify(result?.canned_response, null, 2),
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  },
};

export const TOOLS = buildTools(FRESHSERVICE_TOOLS_METADATA, handlers);
