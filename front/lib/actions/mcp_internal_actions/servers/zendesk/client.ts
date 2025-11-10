import type { z } from "zod";

import type { ZendeskTicket } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import { ZendeskTicketResponseSchema } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export class ZendeskClient {
  private readonly subdomain: string;
  private readonly accessToken: string;

  constructor(subdomain: string, accessToken: string) {
    this.subdomain = subdomain;
    this.accessToken = accessToken;
  }

  private async getRequest<T extends z.Schema>(
    endpoint: string,
    schema: T
  ): Promise<Result<z.infer<T>, Error>> {
    const url = `https://${this.subdomain}.zendesk.com/api/v2/${endpoint}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
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
    const result = await this.getRequest(
      `tickets/${ticketId}`,
      ZendeskTicketResponseSchema
    );

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok(result.value.ticket);
  }
}
