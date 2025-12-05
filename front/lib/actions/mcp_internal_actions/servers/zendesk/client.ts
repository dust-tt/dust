import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ZendeskSearchResponse,
  ZendeskTicket,
  ZendeskTicketComment,
  ZendeskTicketField,
  ZendeskTicketMetrics,
  ZendeskUser,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import {
  isValidZendeskSubdomain,
  ZendeskSearchResponseSchema,
  ZendeskTicketCommentsResponseSchema,
  ZendeskTicketFieldsResponseSchema,
  ZendeskTicketMetricsResponseSchema,
  ZendeskTicketResponseSchema,
  ZendeskUsersResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export class ZendeskApiError extends Error {
  public readonly isInvalidInput: boolean;

  constructor(
    message: string,
    { isInvalidInput }: { isInvalidInput: boolean }
  ) {
    super(message);
    this.isInvalidInput = isInvalidInput;
  }
}

const MAX_CUSTOM_FIELDS_TO_FETCH = 50;

export function getUniqueCustomFieldIds(
  tickets: ZendeskTicket | ZendeskTicket[]
): number[] {
  const ticketsArray = Array.isArray(tickets) ? tickets : [tickets];
  const fieldIds = new Set<number>();

  for (const ticket of ticketsArray) {
    if (ticket.custom_fields) {
      for (const field of ticket.custom_fields) {
        if (field.value !== null && field.value !== "") {
          fieldIds.add(field.id);
        }
      }
    }
  }

  return Array.from(fieldIds).slice(0, MAX_CUSTOM_FIELDS_TO_FETCH);
}

export function getZendeskClient(
  authInfo: AuthInfo | undefined
): Result<ZendeskClient, MCPError> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(
      new MCPError(
        "No access token found. Please connect your Zendesk account."
      )
    );
  }

  const subdomain = authInfo?.extra?.zendesk_subdomain;
  if (!isValidZendeskSubdomain(subdomain)) {
    return new Err(
      new MCPError(
        "Invalid or missing Zendesk subdomain. Please reconnect your Zendesk account."
      )
    );
  }

  return new Ok(new ZendeskClient(subdomain, accessToken));
}

class ZendeskClient {
  constructor(
    private subdomain: string,
    private accessToken: string
  ) {}

  private async request<T extends z.Schema>(
    endpoint: string,
    schema: T,
    {
      method,
      body,
    }:
      | {
          method: "GET";
          body?: never;
        }
      | {
          method: "POST" | "PUT";
          body: unknown;
        } = {
      method: "GET",
    }
  ): Promise<Result<z.infer<T>, Error>> {
    const url = `https://${this.subdomain}.zendesk.com/api/v2/${endpoint}`;
    const response = await untrustedFetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new ZendeskApiError(
          `Zendesk API error (${response.status}): ${errorText || response.statusText}`,
          { isInvalidInput: response.status === 422 }
        )
      );
    }

    const rawData = await response.json();
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        {
          endpoint,
          error: parseResult.error.message,
        },
        "[Zendesk] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Zendesk API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async getTicket(ticketId: number): Promise<Result<ZendeskTicket, Error>> {
    const result = await this.request(
      `tickets/${ticketId}`,
      ZendeskTicketResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.ticket);
  }

  async getTicketMetrics(
    ticketId: number
  ): Promise<Result<ZendeskTicketMetrics, Error>> {
    const result = await this.request(
      `tickets/${ticketId}/metrics`,
      ZendeskTicketMetricsResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.ticket_metric);
  }

  async searchTickets(
    query: string,
    sortBy?: string,
    sortOrder?: string
  ): Promise<Result<ZendeskSearchResponse, Error>> {
    const params = new URLSearchParams({
      query: `type:ticket ${query}`,
    });

    if (sortBy) {
      params.append("sort_by", sortBy);
    }

    if (sortOrder) {
      params.append("sort_order", sortOrder);
    }

    const result = await this.request(
      `search.json?${params.toString()}`,
      ZendeskSearchResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value);
  }

  async draftReply(
    ticketId: number,
    body: string
  ): Promise<Result<ZendeskTicket, Error>> {
    const result = await this.request(
      `tickets/${ticketId}`,
      ZendeskTicketResponseSchema,
      {
        method: "PUT",
        body: {
          ticket: {
            comment: {
              body,
              public: false,
            },
          },
        },
      }
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.ticket);
  }

  async getTicketFieldsByIds(
    fieldIds: number[]
  ): Promise<Result<ZendeskTicketField[], Error>> {
    if (fieldIds.length === 0) {
      return new Ok([]);
    }

    const idsParam = fieldIds.join(",");
    const result = await this.request(
      `ticket_fields/show_many?ids=${idsParam}`,
      ZendeskTicketFieldsResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.ticket_fields.filter((f) => f.active));
  }

  async getTicketComments(
    ticketId: number
  ): Promise<Result<ZendeskTicketComment[], Error>> {
    const result = await this.request(
      `tickets/${ticketId}/comments`,
      ZendeskTicketCommentsResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.comments);
  }

  async getUsersByIds(
    userIds: number[]
  ): Promise<Result<ZendeskUser[], Error>> {
    if (userIds.length === 0) {
      return new Ok([]);
    }

    // Zendesk API supports up to 100 user IDs per request
    const chunks: number[][] = [];
    for (let i = 0; i < userIds.length; i += 100) {
      chunks.push(userIds.slice(i, i + 100));
    }

    const allUsers: ZendeskUser[] = [];

    for (const chunk of chunks) {
      const idsParam = chunk.join(",");
      const result = await this.request(
        `users/show_many?ids=${idsParam}`,
        ZendeskUsersResponseSchema
      );

      if (result.isErr()) {
        return new Err(result.error);
      }

      allUsers.push(...result.value.users);
    }

    return new Ok(allUsers);
  }
}
