import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "freshservice",
  icon: "FreshserviceLogo",
  version: "1.0.0",
  description:
    "Freshservice integration supporting ticket management, service catalog, solutions, departments, " +
    "on-call schedules, and more. Provides comprehensive access to Freshservice resources with " +
    "OAuth authentication and secure API access.",
  authorization: {
    provider: "freshservice" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  documentationUrl: null,
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  // Helper function to make authenticated API calls
  const withAuth = async <T>({
    action,
    authInfo,
  }: {
    action: (accessToken: string, domain: string) => Promise<T>;
    authInfo?: { token?: string; extra?: Record<string, unknown> };
  }): Promise<T> => {
    if (!authInfo?.token) {
      return makeMCPToolTextError(
        "Authentication required. Please connect your Freshservice account."
      ) as T;
    }

    // Extract domain from extra metadata
    const domain = authInfo.extra?.instance_url as string;
    if (!domain) {
      return makeMCPToolTextError(
        "Freshworks organization URL not configured. Please reconnect your Freshservice account."
      ) as T;
    }

    try {
      return await action(authInfo.token, domain);
    } catch (error) {
      return makeMCPToolTextError(
        `API request failed: ${error instanceof Error ? error.message : "Unknown error"}`
      ) as T;
    }
  };

  // Helper function to make API requests
  const apiRequest = async (
    accessToken: string,
    domain: string,
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const response = await fetch(`https://${domain}/api/v2/${endpoint}`, {
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

  // Tickets endpoints
  server.tool(
    "list_tickets",
    "Lists tickets with optional filtering and pagination",
    {
      filter: z
        .object({
          email: z.string().optional().describe("Requester email"),
          status: z.string().optional().describe("Ticket status"),
          priority: z.string().optional().describe("Ticket priority"),
          type: z.string().optional().describe("Ticket type"),
        })
        .optional(),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ filter, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, domain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          if (filter?.email) {
            params.append("email", filter.email);
          }
          if (filter?.status) {
            params.append("filter[status]", filter.status);
          }
          if (filter?.priority) {
            params.append("filter[priority]", filter.priority);
          }
          if (filter?.type) {
            params.append("filter[type]", filter.type);
          }

          const result = await apiRequest(
            accessToken,
            domain,
            `tickets?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.tickets?.length || 0} tickets`,
            result: result.tickets || [],
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_ticket",
    "Gets detailed information about a specific ticket",
    {
      ticket_id: z.number().describe("The ID of the ticket"),
      include: z
        .array(
          z.enum([
            "conversations",
            "requester",
            "stats",
            "problem",
            "assets",
            "change",
            "related_tickets",
            "requested_for",
            "department",
            "team",
            "group",
            "onboarding_context",
            "policy_breach",
          ])
        )
        .optional()
        .describe("Additional information to include"),
    },
    async ({ ticket_id, include }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, domain) => {
          const params = include?.length ? `?include=${include.join(",")}` : "";
          const result = await apiRequest(
            accessToken,
            domain,
            `tickets/${ticket_id}${params}`
          );

          return makeMCPToolJSONSuccess({
            message: "Ticket retrieved successfully",
            result: result.ticket,
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
        action: async (accessToken, domain) => {
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

          const result = await apiRequest(accessToken, domain, "tickets", {
            method: "POST",
            body: JSON.stringify(ticketData),
          });

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
        action: async (accessToken, domain) => {
          const updateData: any = {};

          if (subject) updateData.subject = subject;
          if (description) updateData.description = description;
          if (priority) updateData.priority = parseInt(priority);
          if (status) updateData.status = parseInt(status);
          if (tags) updateData.tags = tags;
          if (custom_fields) updateData.custom_fields = custom_fields;

          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
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
            domain,
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

  // Solutions (Knowledge Base)
  server.tool(
    "list_solution_categories",
    "Lists solution categories",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (accessToken, domain) => {
          const result = await apiRequest(
            accessToken,
            domain,
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
    "Lists solution articles",
    {
      folder_id: z.number().optional().describe("Filter by folder ID"),
      category_id: z.number().optional().describe("Filter by category ID"),
      page: z.number().optional().default(1),
      per_page: z.number().optional().default(30),
    },
    async ({ folder_id, category_id, page, per_page }, { authInfo }) => {
      return withAuth({
        action: async (accessToken, domain) => {
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
            domain,
            `solutions/articles?${params.toString()}`
          );

          return makeMCPToolJSONSuccess({
            message: `Retrieved ${result.articles?.length || 0} solution articles`,
            result: result.articles || [],
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
        action: async (accessToken, domain) => {
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
            domain,
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
        action: async (accessToken, domain) => {
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
            domain,
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
        action: async (accessToken, domain) => {
          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const params = new URLSearchParams({
            page: page.toString(),
            per_page: per_page.toString(),
          });

          const result = await apiRequest(
            accessToken,
            domain,
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
        action: async (accessToken, domain) => {
          const result = await apiRequest(accessToken, domain, "sla_policies");

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
export { serverInfo };
