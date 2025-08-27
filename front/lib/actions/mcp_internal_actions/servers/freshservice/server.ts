import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";

import type { FreshserviceTicket } from "./freshservice_api_helper";
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

    return response.json();
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
    "Creates a new ticket in Freshservice",
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

          return makeMCPToolJSONSuccess({
            message: "Ticket created successfully",
            result: result.ticket,
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
      body: z.string().describe("The note content"),
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
                note: {
                  body,
                  private: isPrivate,
                },
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
      body: z.string().describe("The reply content"),
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
                reply: {
                  body,
                },
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
    "list_service_items",
    "Lists service catalog items",
    {
      category_id: z.number().optional().describe("Filter by category ID"),
      search: z.string().optional().describe("Search term"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ category_id, search, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (category_id) {
            params.append("category_id", category_id.toString());
          }
          if (search) {
            params.append("search", search);
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
    "get_service_item",
    "Gets detailed information about a specific service catalog item including fields and pricing",
    {
      item_id: z.number().describe("The ID of the service catalog item"),
    },
    async ({ item_id }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${item_id}`
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
    "request_service_item",
    "Creates a service request for a catalog item and optionally attaches it to an existing ticket",
    {
      item_id: z
        .number()
        .describe("The ID of the service catalog item to request"),
      email: z.string().describe("Requester email address"),
      quantity: z
        .number()
        .optional()
        .default(1)
        .describe("Quantity of items to request"),
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
      { item_id, email, quantity, requested_for, fields, ticket_id },
      { authInfo }
    ) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          // First, get the service item details to understand required fields
          const itemResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            `service_catalog/items/${item_id}`
          );

          const serviceItem = itemResult.service_item;

          // Prepare the service request data
          const requestData: any = {
            email,
            quantity,
            service_item_id: item_id,
          };

          if (requested_for) {
            requestData.requested_for = requested_for;
          }

          if (fields) {
            requestData.custom_fields = fields;
          }

          // Create the service request
          const serviceRequestResult = await apiRequest(
            accessToken,
            freshserviceDomain,
            "service_catalog/place_request",
            {
              method: "POST",
              body: JSON.stringify({
                service_request: requestData,
              }),
            }
          );

          // If a ticket_id is provided, update the ticket to reference the service request
          let ticketUpdateResult = null;
          if (ticket_id && serviceRequestResult.service_request) {
            try {
              // Add a note to the ticket about the service request
              const noteBody = `Service Request #${serviceRequestResult.service_request.id} has been created for: ${serviceItem.name}`;

              await apiRequest(
                accessToken,
                freshserviceDomain,
                `tickets/${ticket_id}/notes`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    note: {
                      body: noteBody,
                      private: false,
                    },
                  }),
                }
              );

              ticketUpdateResult = {
                message: `Service request attached to ticket #${ticket_id}`,
              };
            } catch (error) {
              // Non-fatal error - service request was created but couldn't link to ticket
              ticketUpdateResult = {
                warning: `Service request created but could not attach to ticket #${ticket_id}: ${error}`,
              };
            }
          }

          return makeMCPToolJSONSuccess({
            message: `Service request created successfully${ticket_id ? ` and attached to ticket #${ticket_id}` : ""}`,
            result: {
              service_request: serviceRequestResult.service_request,
              service_item: serviceItem,
              ticket_update: ticketUpdateResult,
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
    "Lists solution categories",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const result = await apiRequest(
            accessToken,
            freshserviceDomain,
            "solutions/categories"
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
    "list_solution_articles",
    "Lists solution articles (returns metadata only, use get_solution_article for full content)",
    {
      folder_id: z.number().optional().describe("Filter by folder ID"),
      category_id: z.number().optional().describe("Filter by category ID"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ folder_id, category_id, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, freshserviceDomain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (folder_id) {
            params.append("folder_id", folder_id.toString());
          }
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
    "Creates a new solution article",
    {
      title: z.string().describe("Article title"),
      description: z.string().describe("Article content"),
      folder_id: z.number().describe("Folder ID to place the article in"),
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

  return server;
};

export default createServer;
