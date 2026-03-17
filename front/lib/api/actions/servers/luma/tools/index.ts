import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { LumaClient } from "@app/lib/api/actions/servers/luma/client";
import { getLumaClient } from "@app/lib/api/actions/servers/luma/client";
import { LUMA_TOOLS_METADATA } from "@app/lib/api/actions/servers/luma/metadata";
import {
  renderEvent,
  renderEventInsights,
  renderEventList,
  renderGuest,
  renderGuestList,
  renderUser,
} from "@app/lib/api/actions/servers/luma/rendering";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";

async function withClient(
  extra: ToolHandlerExtra,
  action: (client: LumaClient) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const clientResult = getLumaClient(extra);
  if (clientResult.isErr()) {
    return clientResult;
  }
  return action(clientResult.value);
}

export function createLumaTools(
  _auth: Authenticator,
  _agentLoopContext?: AgentLoopContextType
) {
  const handlers: ToolHandlers<typeof LUMA_TOOLS_METADATA> = {
    get_authenticated_user: async (_params, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.getSelf();
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to get account info: ${result.error.message}`)
          );
        }
        return new Ok([
          { type: "text" as const, text: renderUser(result.value) },
        ]);
      });
    },

    get_event: async ({ event_api_id }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.getEvent(event_api_id);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to get event: ${result.error.message}`)
          );
        }
        return new Ok([
          { type: "text" as const, text: renderEvent(result.value) },
        ]);
      });
    },

    list_events: async ({ after, before }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.listEvents({ after, before });
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list events: ${result.error.message}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: renderEventList(result.value.events, result.value.nextCursor),
          },
        ]);
      });
    },

    create_event: async (params, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.createEvent(params);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to create event: ${result.error.message}`)
          );
        }
        const event = result.value;
        return new Ok([
          {
            type: "text" as const,
            text:
              `Created event "${event.name}".\n\n` +
              `- ID: ${event.api_id}\n` +
              (event.url ? `- URL: ${event.url}\n` : "") +
              `- Start: ${event.start_at}`,
          },
        ]);
      });
    },

    update_event: async (
      { event_api_id, ...updateData },
      extra: ToolHandlerExtra
    ) => {
      return withClient(extra, async (client) => {
        const result = await client.updateEvent(event_api_id, updateData);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to update event: ${result.error.message}`)
          );
        }
        const event = result.value;
        return new Ok([
          {
            type: "text" as const,
            text:
              `Updated event "${event.name}".\n\n` +
              `- ID: ${event.api_id}\n` +
              (event.url ? `- URL: ${event.url}\n` : "") +
              `- Start: ${event.start_at}`,
          },
        ]);
      });
    },

    list_guests: async (
      { event_api_id, ...listParams },
      extra: ToolHandlerExtra
    ) => {
      return withClient(extra, async (client) => {
        const result = await client.listGuests(event_api_id, listParams);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list guests: ${result.error.message}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: renderGuestList(result.value.guests, result.value.nextCursor),
          },
        ]);
      });
    },

    get_guest: async (
      { event_api_id, guest_api_id },
      extra: ToolHandlerExtra
    ) => {
      return withClient(extra, async (client) => {
        const result = await client.getGuest(event_api_id, guest_api_id);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to get guest: ${result.error.message}`)
          );
        }
        return new Ok([
          { type: "text" as const, text: renderGuest(result.value) },
        ]);
      });
    },

    update_guest_status: async (
      { event_api_id, guest_api_id_or_email, status, should_refund },
      extra: ToolHandlerExtra
    ) => {
      return withClient(extra, async (client) => {
        const result = await client.updateGuestStatus(event_api_id, {
          guest_api_id_or_email,
          status,
          should_refund,
        });
        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to update guest status: ${result.error.message}`
            )
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: `Updated guest "${guest_api_id_or_email}" to "${status}".`,
          },
        ]);
      });
    },

    add_guests: async ({ event_api_id, guests }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.addGuests(event_api_id, guests);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to add guests: ${result.error.message}`)
          );
        }
        const addedGuests = result.value;
        return new Ok([
          {
            type: "text" as const,
            text: `Added ${addedGuests.length} guests to the event.`,
          },
        ]);
      });
    },

    send_invites: async ({ event_api_id, emails }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.sendInvites(event_api_id, { emails });
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to send invites: ${result.error.message}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: `Sent invitations to ${emails.length} emails.`,
          },
        ]);
      });
    },

    search_guests: async ({ event_api_id, query }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const result = await client.listAllGuests(event_api_id);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to fetch guests: ${result.error.message}`)
          );
        }

        const lowerQuery = query.toLowerCase();
        const matches = result.value.filter(
          (g) =>
            g.name?.toLowerCase().includes(lowerQuery) ||
            g.email?.toLowerCase().includes(lowerQuery)
        );

        return new Ok([
          {
            type: "text" as const,
            text: renderGuestList(matches, null),
          },
        ]);
      });
    },

    get_event_insights: async ({ event_api_id }, extra: ToolHandlerExtra) => {
      return withClient(extra, async (client) => {
        const eventResult = await client.getEvent(event_api_id);
        if (eventResult.isErr()) {
          return new Err(
            new MCPError(`Failed to get event: ${eventResult.error.message}`)
          );
        }

        const guestsResult = await client.listAllGuests(event_api_id);
        if (guestsResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to fetch guests: ${guestsResult.error.message}`
            )
          );
        }

        const ticketsResult = await client.listTicketTypes(event_api_id);
        if (ticketsResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to fetch ticket types: ${ticketsResult.error.message}`
            )
          );
        }

        return new Ok([
          {
            type: "text" as const,
            text: renderEventInsights(
              eventResult.value,
              guestsResult.value,
              ticketsResult.value
            ),
          },
        ]);
      });
    },
  };

  return buildTools(LUMA_TOOLS_METADATA, handlers);
}
