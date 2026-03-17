import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  CreateEventParams,
  GuestInput,
  ListEventsParams,
  ListGuestsParams,
  LumaEvent,
  LumaGuest,
  LumaTicketType,
  LumaUser,
  SendInvitesParams,
  UpdateEventParams,
  UpdateGuestStatusParams,
} from "@app/lib/api/actions/servers/luma/types";
import {
  LumaEventListResponseSchema,
  LumaEventSchema,
  LumaGuestListResponseSchema,
  LumaGuestSchema,
  LumaTicketTypeListResponseSchema,
  LumaUserSchema,
} from "@app/lib/api/actions/servers/luma/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const LUMA_API_BASE_URL = "https://public-api.luma.com";

const LUMA_API_PATHS = {
  getSelf: "/v1/user/get-self",
  getEvent: "/v1/event/get",
  listEvents: "/v1/calendar/list-events",
  getGuests: "/v1/event/get-guests",
  getGuest: "/v1/event/get-guest",
  listTicketTypes: "/v1/event/ticket-types/list",
  createEvent: "/v1/event/create",
  updateEvent: "/v1/event/update",
  updateGuestStatus: "/v1/event/update-guest-status",
  addGuests: "/v1/event/add-guests",
  sendInvites: "/v1/event/send-invites",
} as const;

const LUMA_LIST_ALL_GUESTS_MAX = 1000;
const LUMA_LIST_ALL_GUESTS_PAGE_SIZE = 50;

export function getLumaClient(
  extra: ToolHandlerExtra
): Result<LumaClient, MCPError> {
  const apiKey = extra.authInfo?.token;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Luma API key not configured. Please ask a workspace admin to configure it in the MCP server settings.",
        { tracked: false }
      )
    );
  }

  return new Ok(new LumaClient(apiKey));
}

export class LumaClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T extends z.Schema>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    schema: T,
    params?: Record<string, unknown>
  ): Promise<Result<z.infer<T>, Error>> {
    const url = new URL(`${LUMA_API_BASE_URL}${path}`);

    if (method === "GET" && params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    let response;
    try {
      response = await untrustedFetch(url.toString(), {
        method,
        headers: {
          "x-luma-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: method !== "GET" ? JSON.stringify(params ?? {}) : undefined,
      });
    } catch (err) {
      return new Err(normalizeError(err));
    }

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Luma API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch (err) {
      return new Err(normalizeError(err));
    }
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error(
        { error: parseResult.error.message },
        "[Luma] Invalid API response format"
      );
      return new Err(
        new Error(
          `Invalid Luma API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  // --- Read methods ---

  async getSelf(): Promise<Result<LumaUser, Error>> {
    // get-self returns the user object directly (no wrapper).
    return this.request("GET", LUMA_API_PATHS.getSelf, LumaUserSchema);
  }

  async getEvent(eventApiId: string): Promise<Result<LumaEvent, Error>> {
    // get event returns the event object directly.
    return this.request("GET", LUMA_API_PATHS.getEvent, LumaEventSchema, {
      event_api_id: eventApiId,
    });
  }

  async listEvents(
    params?: ListEventsParams
  ): Promise<
    Result<{ events: LumaEvent[]; nextCursor: string | null }, Error>
  > {
    const result = await this.request(
      "GET",
      LUMA_API_PATHS.listEvents,
      LumaEventListResponseSchema,
      { ...params }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok({
      events: result.value.entries.map((entry) => entry.event),
      nextCursor: result.value.next_cursor ?? null,
    });
  }

  async listGuests(
    eventApiId: string,
    params?: ListGuestsParams
  ): Promise<
    Result<{ guests: LumaGuest[]; nextCursor: string | null }, Error>
  > {
    const result = await this.request(
      "GET",
      LUMA_API_PATHS.getGuests,
      LumaGuestListResponseSchema,
      { event_api_id: eventApiId, ...params }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok({
      guests: result.value.entries.map((entry) => entry.guest),
      nextCursor: result.value.next_cursor ?? null,
    });
  }

  async getGuest(
    eventApiId: string,
    guestApiId: string
  ): Promise<Result<LumaGuest, Error>> {
    return this.request("GET", LUMA_API_PATHS.getGuest, LumaGuestSchema, {
      event_api_id: eventApiId,
      guest_api_id: guestApiId,
    });
  }

  async listTicketTypes(
    eventApiId: string
  ): Promise<Result<LumaTicketType[], Error>> {
    const result = await this.request(
      "GET",
      LUMA_API_PATHS.listTicketTypes,
      LumaTicketTypeListResponseSchema,
      { event_api_id: eventApiId }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok(result.value.entries);
  }

  // --- Write methods ---

  async createEvent(
    data: CreateEventParams
  ): Promise<Result<LumaEvent, Error>> {
    return this.request("POST", LUMA_API_PATHS.createEvent, LumaEventSchema, {
      ...data,
    });
  }

  async updateEvent(
    eventApiId: string,
    data: UpdateEventParams
  ): Promise<Result<LumaEvent, Error>> {
    return this.request("POST", LUMA_API_PATHS.updateEvent, LumaEventSchema, {
      event_api_id: eventApiId,
      ...data,
    });
  }

  async updateGuestStatus(
    eventApiId: string,
    data: UpdateGuestStatusParams
  ): Promise<Result<void, Error>> {
    const isEmail = data.guest_api_id_or_email.includes("@");
    const guest = isEmail
      ? { type: "email", email: data.guest_api_id_or_email }
      : { type: "api_id", api_id: data.guest_api_id_or_email };

    const result = await this.request(
      "POST",
      LUMA_API_PATHS.updateGuestStatus,
      z.object({}).passthrough(),
      {
        event_api_id: eventApiId,
        guest,
        status: data.status,
        should_refund: data.should_refund,
      }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok(undefined);
  }

  async addGuests(
    eventApiId: string,
    guests: GuestInput[]
  ): Promise<Result<LumaGuest[], Error>> {
    const result = await this.request(
      "POST",
      LUMA_API_PATHS.addGuests,
      LumaGuestListResponseSchema,
      { event_api_id: eventApiId, guests }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok(result.value.entries.map((entry) => entry.guest));
  }

  async sendInvites(
    eventApiId: string,
    data: SendInvitesParams
  ): Promise<Result<void, Error>> {
    const result = await this.request(
      "POST",
      LUMA_API_PATHS.sendInvites,
      z.object({}).passthrough(),
      { event_api_id: eventApiId, ...data }
    );
    if (result.isErr()) {
      return result;
    }
    return new Ok(undefined);
  }

  // --- Composite helpers ---

  async listAllGuests(
    eventApiId: string,
    maxGuests = LUMA_LIST_ALL_GUESTS_MAX
  ): Promise<Result<LumaGuest[], Error>> {
    const allGuests: LumaGuest[] = [];
    let paginationCursor: string | undefined;

    while (allGuests.length < maxGuests) {
      const result = await this.listGuests(eventApiId, {
        pagination_cursor: paginationCursor,
        pagination_limit: LUMA_LIST_ALL_GUESTS_PAGE_SIZE,
      });
      if (result.isErr()) {
        return result;
      }

      allGuests.push(...result.value.guests);

      if (!result.value.nextCursor) {
        break;
      }
      paginationCursor = result.value.nextCursor;
    }

    return new Ok(allGuests.slice(0, maxGuests));
  }
}
