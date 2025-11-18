import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ZendeskSearchResponse,
  ZendeskTicket,
  ZendeskTicketMetrics,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import {
  ZendeskSearchResponseSchema,
  ZendeskTicketMetricsResponseSchema,
  ZendeskTicketResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isValidZendeskSubdomain, Ok } from "@app/types";

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
    const response = await fetch(url, {
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
        new Error(
          `Zendesk API error (${response.status}): ${errorText || response.statusText}`
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
}
