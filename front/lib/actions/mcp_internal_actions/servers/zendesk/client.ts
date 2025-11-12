import type { z } from "zod";

import type {
  ZendeskSearchResponse,
  ZendeskTicket,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import {
  ZendeskSearchResponseSchema,
  ZendeskTicketResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export class ZendeskClient {
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
